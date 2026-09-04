import {
  OfficialSourceHistoricalBaselineError,
  assertOfficialSourceHistoricalBaseline,
  buildOfficialSourcePreflightSummary,
} from "../../../../../src/application/source-preflight";
import {
  SourceSyncRuntimeCompatibilityError,
  assertSourceSyncRuntimeCapabilities,
  type SourceSyncRuntimeCapabilities,
} from "../../../../../src/application/source-sync-runtime-contract";
import { GoogleOauthError } from "../../../../../src/infrastructure/google/google-oauth";
import { GoogleOauthGateway } from "../../../../../src/infrastructure/google/google-oauth-gateway";
import {
  OFFICIAL_GOOGLE_SOURCE_NAME,
  GoogleSourceRuntimeConfigurationError,
  createGoogleSourceRuntime,
  getGoogleSourceServerConfiguration,
} from "../../../../../src/infrastructure/google/google-source-runtime";
import { GoogleOfficialSourceReadError } from "../../../../../src/infrastructure/google/official-bank-source-reader";
import {
  PersistenceGatewayError,
  callPersistenceGateway,
} from "../../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

type GatewaySourceStatus = {
  run: null | {
    id: string;
    source_file_id: string;
    source_revision: string | null;
    status: string;
    started_at: string;
    finished_at: string | null;
    rows_seen: number;
    rows_inserted: number;
    rows_revised: number;
    rows_skipped: number;
    rows_failed: number;
    duplicates_detected: number;
    warnings_count: number;
    error_code: string | null;
    error_message: string | null;
  };
  cursors: Array<{
    source_file_id: string;
    source_sheet_id: string;
    source_revision: string | null;
    last_source_row_key: string | null;
    last_successful_run_id: string | null;
    updated_at: string;
  }>;
};

function connectionMatchesContract(
  connection: { account_email: string; source_file_name: string },
  allowedEmail: string,
) {
  return (
    connection.account_email.toLowerCase() === allowedEmail &&
    connection.source_file_name === OFFICIAL_GOOGLE_SOURCE_NAME
  );
}

export async function GET() {
  try {
    const configuration = getGoogleSourceServerConfiguration();
    const oauth = new GoogleOauthGateway();
    const connection = await oauth.status();
    if (!connection) {
      return Response.json(
        { run: null, cursors: [] },
        { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    if (!connectionMatchesContract(connection, configuration.allowedEmail)) {
      return Response.json(
        { error: "google_connection_contract_mismatch" },
        { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }

    const status = await callPersistenceGateway<GatewaySourceStatus>("source.status", {
      sourceFileId: connection.source_file_id,
    });

    return Response.json(
      {
        run: status.run
          ? {
              id: status.run.id,
              sourceFileId: status.run.source_file_id,
              sourceRevision: status.run.source_revision,
              status: status.run.status,
              startedAt: status.run.started_at,
              finishedAt: status.run.finished_at,
              rowsSeen: status.run.rows_seen,
              rowsInserted: status.run.rows_inserted,
              rowsRevised: status.run.rows_revised,
              rowsSkipped: status.run.rows_skipped,
              rowsFailed: status.run.rows_failed,
              duplicatesDetected: status.run.duplicates_detected,
              warningsCount: status.run.warnings_count,
              errorCode: status.run.error_code,
              errorMessage: status.run.error_message,
            }
          : null,
        cursors: status.cursors.map((cursor) => ({
          sourceFileId: cursor.source_file_id,
          sourceSheetId: cursor.source_sheet_id,
          sourceRevision: cursor.source_revision,
          lastSourceRowKey: cursor.last_source_row_key,
          lastSuccessfulRunId: cursor.last_successful_run_id,
          updatedAt: cursor.updated_at,
        })),
      },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      return Response.json(
        { error: "google_oauth_not_configured", missing: error.missing },
        { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    return Response.json(
      { error: "source_status_unavailable" },
      { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
}

export async function POST() {
  try {
    const configuration = getGoogleSourceServerConfiguration();
    const oauth = new GoogleOauthGateway();

    const capabilities = await callPersistenceGateway<SourceSyncRuntimeCapabilities>("source.capabilities");
    assertSourceSyncRuntimeCapabilities(capabilities);

    const connection = await oauth.status();
    if (!connection) {
      return Response.json(
        { error: "google_oauth_not_connected" },
        { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    if (!connectionMatchesContract(connection, configuration.allowedEmail)) {
      return Response.json(
        { error: "google_connection_contract_mismatch" },
        { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }

    const runtime = createGoogleSourceRuntime(connection.source_file_id);
    const snapshot = await runtime.reader.read();
    assertOfficialSourceHistoricalBaseline(buildOfficialSourcePreflightSummary(snapshot));
    const result = await runtime.synchronization.synchronize(snapshot);
    await runtime.oauth.markVerified();

    return Response.json(
      {
        ...result,
        sourceRevision: snapshot.sourceRevision,
      },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  } catch (error) {
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      return Response.json(
        { error: "google_oauth_not_configured", missing: error.missing },
        { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    if (
      error instanceof SourceSyncRuntimeCompatibilityError ||
      (error instanceof PersistenceGatewayError && error.code === "unsupported_action")
    ) {
      return Response.json(
        { error: "source_runtime_incompatible" },
        { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    if (error instanceof PersistenceGatewayError && error.code === "google_oauth_not_connected") {
      return Response.json(
        { error: "google_oauth_not_connected" },
        { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    if (error instanceof GoogleOauthError && error.code === "google_reauthorization_required") {
      return Response.json(
        { error: "google_oauth_not_connected" },
        { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    if (
      error instanceof GoogleOauthError &&
      (error.code === "google_refresh_failed" || error.code === "google_token_response_invalid")
    ) {
      return Response.json(
        { error: "google_oauth_refresh_unavailable" },
        { status: 503, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    if (error instanceof GoogleOfficialSourceReadError && error.code === "source_changed_during_read") {
      return Response.json(
        { error: "google_source_changed_during_read" },
        { status: 409, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    if (error instanceof OfficialSourceHistoricalBaselineError) {
      return Response.json(
        { error: "google_source_historical_regression", code: error.code },
        { status: 422, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
      );
    }
    console.error("google-source-sync", error instanceof Error ? error.name : "unknown_error");
    return Response.json(
      { error: "google_source_sync_failed" },
      { status: 500, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
}
