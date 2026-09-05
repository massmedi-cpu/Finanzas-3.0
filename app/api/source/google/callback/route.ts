import { prepareOfficialSourceSyncBatch } from "../../../../../src/application/source-sync-service";
import {
  OfficialSourceHistoricalBaselineError,
  assertOfficialSourceHistoricalBaseline,
  buildOfficialSourcePreflightSummary,
} from "../../../../../src/application/source-preflight";
import {
  GoogleOauthError,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo,
  validateGoogleOauthState,
} from "../../../../../src/infrastructure/google/google-oauth";
import { GoogleOauthGateway } from "../../../../../src/infrastructure/google/google-oauth-gateway";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  OFFICIAL_GOOGLE_SOURCE_NAME,
  GoogleSourceRuntimeConfigurationError,
  getGoogleAllowedAccountEmail,
  getGoogleOauthRedirectUri,
  getGoogleSourceServerConfiguration,
} from "../../../../../src/infrastructure/google/google-source-runtime";
import {
  GoogleOfficialSourceDiscoveryError,
  discoverOfficialBankSpreadsheetId,
} from "../../../../../src/infrastructure/google/official-bank-source-discovery";
import {
  GOOGLE_SOURCE_READONLY_SCOPES,
  GoogleOfficialBankSourceReader,
} from "../../../../../src/infrastructure/google/official-bank-source-reader";

export const dynamic = "force-dynamic";

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function clearStateCookie() {
  return `${GOOGLE_OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function callbackRedirect(request: Request, state: "connected" | "error", code?: string) {
  const redirect = new URL("/configuration/source", request.url);
  redirect.searchParams.set("google", state);
  if (code) redirect.searchParams.set("code", code);

  return new Response(null, {
    status: 302,
    headers: {
      location: redirect.toString(),
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "set-cookie": clearStateCookie(),
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("error")) return callbackRedirect(request, "error", "google_oauth_denied");

  try {
    const configuration = getGoogleSourceServerConfiguration();
    const expectedState = readCookie(request, GOOGLE_OAUTH_STATE_COOKIE);
    if (!expectedState) {
      return callbackRedirect(request, "error", "google_oauth_state_missing");
    }
    validateGoogleOauthState(expectedState, url.searchParams.get("state"));

    const code = url.searchParams.get("code")?.trim() ?? "";
    if (!code) return callbackRedirect(request, "error", "google_oauth_code_missing");

    const oauth = new GoogleOauthGateway();
    const allowedEmail = await getGoogleAllowedAccountEmail(oauth);
    const tokens = await exchangeGoogleAuthorizationCode({
      code,
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      redirectUri: getGoogleOauthRedirectUri(request.url),
    });
    const identity = await fetchGoogleUserInfo(tokens.accessToken);
    if (identity.email !== allowedEmail) {
      return callbackRedirect(request, "error", "google_account_not_allowed");
    }

    const sourceFileId = await discoverOfficialBankSpreadsheetId(tokens.accessToken);
    const reader = new GoogleOfficialBankSourceReader(
      sourceFileId,
      { getAccessToken: async () => tokens.accessToken },
    );
    const snapshot = await reader.read();
    assertOfficialSourceHistoricalBaseline(buildOfficialSourcePreflightSummary(snapshot));
    prepareOfficialSourceSyncBatch(snapshot);

    const stored = await oauth.store({
      googleSubject: identity.subject,
      accountEmail: identity.email,
      refreshToken: tokens.refreshToken,
      scopes: [...GOOGLE_SOURCE_READONLY_SCOPES],
      sourceFileId,
      sourceFileName: OFFICIAL_GOOGLE_SOURCE_NAME,
    });
    if (stored.connected !== true) {
      return callbackRedirect(request, "error", "google_oauth_store_failed");
    }

    return callbackRedirect(request, "connected");
  } catch (error) {
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      return callbackRedirect(request, "error", "google_oauth_not_configured");
    }
    if (error instanceof GoogleOauthError) {
      return callbackRedirect(
        request,
        "error",
        error.code === "invalid_oauth_state" ? "invalid_google_oauth_state" : error.code,
      );
    }
    if (error instanceof GoogleOfficialSourceDiscoveryError) {
      return callbackRedirect(request, "error", error.code);
    }
    if (error instanceof OfficialSourceHistoricalBaselineError) {
      return callbackRedirect(request, "error", "google_source_historical_regression");
    }
    console.error("google-oauth-callback", error instanceof Error ? error.name : "unknown_error");
    return callbackRedirect(request, "error", "google_oauth_callback_failed");
  }
}
