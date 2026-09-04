import {
  OfficialSourceHistoricalBaselineError,
  assertOfficialSourceHistoricalBaseline,
  buildOfficialSourcePreflightSummary,
} from "../../../../../src/application/source-preflight";
import { SourceWorkbookContractError } from "../../../../../src/application/source-sync-service";
import { OfficialSourceContractError } from "../../../../../src/domain/official-bank-source";
import { GoogleOauthError } from "../../../../../src/infrastructure/google/google-oauth";
import { GoogleOauthGateway } from "../../../../../src/infrastructure/google/google-oauth-gateway";
import {
  GoogleSourceRuntimeConfigurationError,
  createGoogleSourceRuntime,
  getGoogleAllowedAccountEmail,
  getGoogleSourceServerConfiguration,
} from "../../../../../src/infrastructure/google/google-source-runtime";
import { GoogleOfficialSourceReadError } from "../../../../../src/infrastructure/google/official-bank-source-reader";

export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

export async function POST() {
  try {
    getGoogleSourceServerConfiguration();
    const oauth = new GoogleOauthGateway();
    const allowedEmail = await getGoogleAllowedAccountEmail(oauth);
    const connection = await oauth.status();

    if (!connection) {
      return Response.json({ error: "google_oauth_not_connected" }, { status: 409, headers: HEADERS });
    }
    if (connection.account_email.toLowerCase() !== allowedEmail) {
      return Response.json({ error: "google_connection_contract_mismatch" }, { status: 409, headers: HEADERS });
    }

    const runtime = createGoogleSourceRuntime(connection.source_file_id);
    const snapshot = await runtime.reader.read();
    const summary = assertOfficialSourceHistoricalBaseline(buildOfficialSourcePreflightSummary(snapshot));

    return Response.json(summary, { headers: HEADERS });
  } catch (error) {
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      return Response.json(
        { error: "google_oauth_not_configured", missing: error.missing },
        { status: 503, headers: HEADERS },
      );
    }
    if (error instanceof GoogleOauthError && error.code === "google_reauthorization_required") {
      return Response.json({ error: "google_oauth_not_connected" }, { status: 409, headers: HEADERS });
    }
    if (
      error instanceof GoogleOauthError &&
      (error.code === "google_refresh_failed" || error.code === "google_token_response_invalid")
    ) {
      return Response.json({ error: "google_oauth_refresh_unavailable" }, { status: 503, headers: HEADERS });
    }
    if (error instanceof GoogleOfficialSourceReadError && error.code === "source_changed_during_read") {
      return Response.json({ error: "google_source_changed_during_read" }, { status: 409, headers: HEADERS });
    }
    if (error instanceof OfficialSourceHistoricalBaselineError) {
      return Response.json(
        { error: "google_source_historical_regression", code: error.code },
        { status: 422, headers: HEADERS },
      );
    }
    if (error instanceof SourceWorkbookContractError || error instanceof OfficialSourceContractError) {
      return Response.json(
        { error: "google_source_contract_invalid", code: error.code },
        { status: 422, headers: HEADERS },
      );
    }

    console.error("google-source-preflight", error instanceof Error ? error.name : "unknown_error");
    return Response.json({ error: "google_source_preflight_failed" }, { status: 500, headers: HEADERS });
  }
}
