import { buildGoogleAuthorizationUrl } from "../../../../../src/infrastructure/google/google-oauth";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GoogleSourceRuntimeConfigurationError,
  createGoogleOauthState,
  getGoogleAllowedAccountEmail,
  getGoogleOauthRedirectUri,
  getGoogleSourceServerConfiguration,
} from "../../../../../src/infrastructure/google/google-source-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const configuration = getGoogleSourceServerConfiguration();
    await getGoogleAllowedAccountEmail();
    const state = createGoogleOauthState();
    const authorizationUrl = buildGoogleAuthorizationUrl({
      clientId: configuration.clientId,
      redirectUri: getGoogleOauthRedirectUri(request.url),
      state,
    });

    return new Response(null, {
      status: 302,
      headers: {
        location: authorizationUrl,
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
        "set-cookie": `${GOOGLE_OAUTH_STATE_COOKIE}=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  } catch (error) {
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      return Response.json(
        { error: "google_oauth_not_configured", missing: error.missing },
        { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    return Response.json(
      { error: "google_oauth_connect_failed" },
      { status: 500, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
}
