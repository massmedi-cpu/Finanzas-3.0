import { prepareOfficialSourceSyncBatch } from "../../../../../src/application/source-sync-service";
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
  getGoogleSourceServerConfiguration,
} from "../../../../../src/infrastructure/google/google-source-runtime";
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

function callbackError(code: string, status = 400) {
  return Response.json(
    { error: code },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
        "set-cookie": clearStateCookie(),
      },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("error")) return callbackError("google_oauth_denied");

  try {
    const configuration = getGoogleSourceServerConfiguration();
    const expectedState = readCookie(request, GOOGLE_OAUTH_STATE_COOKIE) ?? "";
    validateGoogleOauthState(expectedState, url.searchParams.get("state"));

    const code = url.searchParams.get("code")?.trim() ?? "";
    if (!code) return callbackError("google_oauth_code_missing");

    const tokens = await exchangeGoogleAuthorizationCode({
      code,
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      redirectUri: configuration.redirectUri,
    });
    const identity = await fetchGoogleUserInfo(tokens.accessToken);
    if (identity.email !== configuration.allowedEmail) {
      return callbackError("google_account_not_allowed", 403);
    }

    const reader = new GoogleOfficialBankSourceReader(
      configuration.spreadsheetId,
      { getAccessToken: async () => tokens.accessToken },
    );
    const snapshot = await reader.read();
    prepareOfficialSourceSyncBatch(snapshot);

    const oauth = new GoogleOauthGateway();
    const stored = await oauth.store({
      googleSubject: identity.subject,
      accountEmail: identity.email,
      refreshToken: tokens.refreshToken,
      scopes: [...GOOGLE_SOURCE_READONLY_SCOPES],
      sourceFileId: configuration.spreadsheetId,
      sourceFileName: OFFICIAL_GOOGLE_SOURCE_NAME,
    });
    if (stored.connected !== true) return callbackError("google_oauth_store_failed", 500);

    const redirect = new URL("/configuration", request.url);
    redirect.searchParams.set("google", "connected");
    return new Response(null, {
      status: 302,
      headers: {
        location: redirect.toString(),
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
        "set-cookie": clearStateCookie(),
      },
    });
  } catch (error) {
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      return callbackError("google_oauth_not_configured", 503);
    }
    if (error instanceof GoogleOauthError) {
      return callbackError(error.code);
    }
    console.error("google-oauth-callback", error instanceof Error ? error.name : "unknown_error");
    return callbackError("google_oauth_callback_failed", 500);
  }
}
