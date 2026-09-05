import {
  GOOGLE_OAUTH_ALL_SCOPES,
  GoogleOauthError,
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  refreshGoogleAccessToken,
  validateGoogleOauthState,
} from "../infrastructure/google/google-oauth";
import {
  GoogleOfficialSourceDiscoveryError,
  discoverOfficialBankSpreadsheetId,
} from "../infrastructure/google/official-bank-source-discovery";
import {
  buildGoogleOauthRedirectUri,
} from "../infrastructure/google/google-source-runtime";
import { GOOGLE_SOURCE_READONLY_SCOPES } from "../infrastructure/google/official-bank-source-reader";

export type GoogleOauthHealthCheck = { name: string; passed: boolean };
export type GoogleOauthHealth = {
  status: "ok" | "failed";
  passed: number;
  total: number;
  checks: GoogleOauthHealthCheck[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function errorCode(callback: () => Promise<unknown> | unknown) {
  try {
    await callback();
    return null;
  } catch (error) {
    return error instanceof GoogleOauthError ? error.code : "unexpected";
  }
}

async function discoveryErrorCode(callback: () => Promise<unknown>) {
  try {
    await callback();
    return null;
  } catch (error) {
    return error instanceof GoogleOfficialSourceDiscoveryError ? error.code : "unexpected";
  }
}

export async function runGoogleOauthHealthChecks(): Promise<GoogleOauthHealth> {
  const state = "0123456789abcdef0123456789abcdef";
  const authorizationUrl = new URL(
    buildGoogleAuthorizationUrl({
      clientId: "client-test.apps.googleusercontent.com",
      redirectUri: "https://preview.example.test/api/source/google/callback",
      state,
    }),
  );
  const requestedScopes = new Set((authorizationUrl.searchParams.get("scope") ?? "").split(" "));

  const previewRedirect = buildGoogleOauthRedirectUri({
    vercelEnvironment: "preview",
    branchUrl: "financial-app-git-phase-2.example.vercel.app",
  });
  const productionRedirect = buildGoogleOauthRedirectUri({
    vercelEnvironment: "production",
    productionUrl: "financial-app.example.vercel.app",
  });

  let tokenRequestBody = "";
  const validTokenFetcher = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    tokenRequestBody = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "");
    return jsonResponse({
      access_token: "access-token-test",
      refresh_token: "refresh-token-test",
      expires_in: 3600,
      token_type: "Bearer",
      scope: GOOGLE_OAUTH_ALL_SCOPES.join(" "),
    });
  }) as typeof fetch;
  const validTokens = await exchangeGoogleAuthorizationCode({
    code: "code-test",
    clientId: "client-test",
    clientSecret: "secret-test",
    redirectUri: "https://preview.example.test/api/source/google/callback",
    fetcher: validTokenFetcher,
  });

  const missingRefreshCode = await errorCode(() =>
    exchangeGoogleAuthorizationCode({
      code: "code-test",
      clientId: "client-test",
      clientSecret: "secret-test",
      redirectUri: "https://preview.example.test/api/source/google/callback",
      fetcher: (async () =>
        jsonResponse({
          access_token: "access-token-test",
          expires_in: 3600,
          token_type: "Bearer",
          scope: GOOGLE_OAUTH_ALL_SCOPES.join(" "),
        })) as typeof fetch,
    }),
  );

  const missingScopeCode = await errorCode(() =>
    exchangeGoogleAuthorizationCode({
      code: "code-test",
      clientId: "client-test",
      clientSecret: "secret-test",
      redirectUri: "https://preview.example.test/api/source/google/callback",
      fetcher: (async () =>
        jsonResponse({
          access_token: "access-token-test",
          refresh_token: "refresh-token-test",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "openid email https://www.googleapis.com/auth/spreadsheets.readonly",
        })) as typeof fetch,
    }),
  );

  const userInfo = await fetchGoogleUserInfo(
    "access-token-test",
    (async () =>
      jsonResponse({ sub: "google-subject-test", email: "TEST@EXAMPLE.COM", email_verified: true })) as typeof fetch,
  );
  const unverifiedUserCode = await errorCode(() =>
    fetchGoogleUserInfo(
      "access-token-test",
      (async () =>
        jsonResponse({ sub: "google-subject-test", email: "test@example.com", email_verified: false })) as typeof fetch,
    ),
  );

  const refreshed = await refreshGoogleAccessToken({
    refreshToken: "refresh-token-test",
    clientId: "client-test",
    clientSecret: "secret-test",
    fetcher: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
      if (body.get("grant_type") !== "refresh_token") return jsonResponse({}, 400);
      return jsonResponse({ access_token: "refreshed-access-token", expires_in: 3600, token_type: "Bearer" });
    }) as typeof fetch,
  });

  const stateMismatchCode = await errorCode(() => validateGoogleOauthState(state, `${state.slice(0, -1)}0`));

  let discoveryRequestUrl = "";
  let discoveryMethod = "";
  const discoveredSourceId = await discoverOfficialBankSpreadsheetId(
    "access-token-test",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      discoveryRequestUrl = String(url);
      discoveryMethod = init?.method ?? "GET";
      return jsonResponse({
        files: [
          {
            id: "official-sheet-id",
            name: "Movimientos bancarios - fuente",
            mimeType: "application/vnd.google-apps.spreadsheet",
            trashed: false,
          },
        ],
      });
    }) as typeof fetch,
  );
  const discoveryQuery = new URL(discoveryRequestUrl).searchParams.get("q") ?? "";

  const sourceNotFoundCode = await discoveryErrorCode(() =>
    discoverOfficialBankSpreadsheetId(
      "access-token-test",
      (async () => jsonResponse({ files: [] })) as typeof fetch,
    ),
  );
  const sourceAmbiguousCode = await discoveryErrorCode(() =>
    discoverOfficialBankSpreadsheetId(
      "access-token-test",
      (async () =>
        jsonResponse({
          files: [
            {
              id: "official-sheet-a",
              name: "Movimientos bancarios - fuente",
              mimeType: "application/vnd.google-apps.spreadsheet",
              trashed: false,
            },
            {
              id: "official-sheet-b",
              name: "Movimientos bancarios - fuente",
              mimeType: "application/vnd.google-apps.spreadsheet",
              trashed: false,
            },
          ],
        })) as typeof fetch,
    ),
  );

  const checks: GoogleOauthHealthCheck[] = [
    {
      name: "oauth-authorization-uses-only-required-scopes",
      passed:
        requestedScopes.size === GOOGLE_OAUTH_ALL_SCOPES.length &&
        GOOGLE_OAUTH_ALL_SCOPES.every((scope) => requestedScopes.has(scope)) &&
        GOOGLE_SOURCE_READONLY_SCOPES.every((scope) => scope.endsWith(".readonly")),
    },
    {
      name: "oauth-authorization-forces-offline-consent-and-state",
      passed:
        authorizationUrl.searchParams.get("access_type") === "offline" &&
        authorizationUrl.searchParams.get("prompt") === "consent" &&
        authorizationUrl.searchParams.get("response_type") === "code" &&
        authorizationUrl.searchParams.get("state") === state,
    },
    {
      name: "oauth-redirect-is-derived-from-stable-vercel-environment",
      passed:
        previewRedirect ===
          "https://financial-app-git-phase-2.example.vercel.app/api/source/google/callback" &&
        productionRedirect === "https://financial-app.example.vercel.app/api/source/google/callback",
    },
    {
      name: "oauth-state-rejects-mismatch",
      passed: stateMismatchCode === "invalid_oauth_state",
    },
    {
      name: "authorization-code-exchange-keeps-secret-in-post-body",
      passed:
        validTokens.accessToken === "access-token-test" &&
        validTokens.refreshToken === "refresh-token-test" &&
        tokenRequestBody.includes("client_secret=secret-test") &&
        tokenRequestBody.includes("grant_type=authorization_code"),
    },
    {
      name: "authorization-code-requires-refresh-token",
      passed: missingRefreshCode === "google_refresh_token_missing",
    },
    {
      name: "authorization-code-requires-both-readonly-resource-scopes",
      passed: missingScopeCode === "google_required_scope_missing",
    },
    {
      name: "google-userinfo-requires-verified-email",
      passed:
        userInfo.subject === "google-subject-test" &&
        userInfo.email === "test@example.com" &&
        unverifiedUserCode === "google_userinfo_invalid",
    },
    {
      name: "refresh-token-flow-produces-server-access-token",
      passed: refreshed.accessToken === "refreshed-access-token" && refreshed.expiresInSeconds === 3600,
    },
    {
      name: "official-source-is-discovered-by-exact-readonly-drive-query",
      passed:
        discoveredSourceId === "official-sheet-id" &&
        discoveryMethod === "GET" &&
        discoveryRequestUrl.startsWith("https://www.googleapis.com/drive/v3/files?") &&
        discoveryQuery.includes("name = 'Movimientos bancarios - fuente'") &&
        discoveryQuery.includes("mimeType = 'application/vnd.google-apps.spreadsheet'") &&
        discoveryQuery.includes("trashed = false"),
    },
    {
      name: "official-source-discovery-rejects-zero-or-many-candidates",
      passed:
        sourceNotFoundCode === "google_source_not_found" &&
        sourceAmbiguousCode === "google_source_ambiguous",
    },
  ];

  const passed = checks.filter((check) => check.passed).length;
  return {
    status: passed === checks.length ? "ok" : "failed",
    passed,
    total: checks.length,
    checks,
  };
}
