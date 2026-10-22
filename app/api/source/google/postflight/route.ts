import {
  OfficialSourceHistoricalBaselineError,
  assertOfficialSourceHistoricalBaseline, buildOfficialSourcePreflightSummary,
} from "../../../../../src/application/source-preflight";
import {
  buildSourcePostflightReport,
} from "../../../../../src/application/source-postflight-report";
import { SourcePostflightError } from "../../../../../src/domain/source-postflight-reconciliation";
import { SourceWorkbookContractError } from "../../../../../src/application/source-sync-service";
import { OfficialSourceContractError } from "../../../../../src/domain/official-bank-source";
import {
  GoogleSourceConnectionContractError, GoogleSourceRuntimeConfigurationError,
  createGoogleSourceRuntime, resolveGoogleSourceConnection,
} from "../../../../../src/infrastructure/google/google-source-runtime";
import { GoogleOauthError } from "../../../../../src/infrastructure/google/google-oauth";
import { GoogleServiceAccountError } from "../../../../../src/infrastructure/google/google-service-account";
import { GoogleOfficialSourceReadError } from "../../../../../src/infrastructure/google/official-bank-source-reader";
import {
  PersistenceGatewayError, callPersistenceGateway,
} from "../../../../../src/infrastructure/persistence/vercel-supabase-gateway";
import {
  requireVerifiedSourceWorkspace, sourceWorkspaceAuthError,
} from "../../../../../src/infrastructure/auth/source-metadata-access";

export const dynamic = "force-dynamic";
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

/**
 * REC-POST-289: read-only proof for a member of the canonical workspace.
 * The private row-level datasets travel server-to-server only. The browser
 * receives aggregate counts, not bank source IDs, dates, concepts or amounts.
 *
 * Two independent snapshots are compared; this does NOT lock the workbook
 * and database into one atomic cross-system snapshot or authorize any write.
 */
export async function GET() {
  const denied = await requireVerifiedSourceWorkspace();
  if (denied) return denied;
  try {
    const connection = await resolveGoogleSourceConnection();
    if (!connection) {
      return Response.json({ error: "google_oauth_not_connected" }, { status: 409, headers: HEADERS });
    }
    const runtime = createGoogleSourceRuntime(connection.sourceFileId);
    const snapshot = await runtime.reader.read();
    const summary = assertOfficialSourceHistoricalBaseline(buildOfficialSourcePreflightSummary(snapshot));
    const stored = await callPersistenceGateway<unknown>("source.postflight_rows", {
      sourceFileId: summary.sourceFileId,
    });
    const report = buildSourcePostflightReport(snapshot, stored);
    return Response.json({
      ...report,
      readConsistency: "sequential_non_atomic",
      sourceRevision: summary.sourceRevision,
      snapshotFingerprint: summary.snapshotFingerprint,
    }, { headers: HEADERS });
  } catch (error) {
    const denied = sourceWorkspaceAuthError(error);
    if (denied) return denied;
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      return Response.json({ error: "google_oauth_not_configured" }, { status: 503, headers: HEADERS });
    }
    if (error instanceof GoogleSourceConnectionContractError) {
      return Response.json({ error: "google_connection_contract_mismatch" }, { status: 409, headers: HEADERS });
    }
    if (error instanceof GoogleOauthError && error.code === "google_reauthorization_required") {
      return Response.json({ error: "google_oauth_not_connected" }, { status: 409, headers: HEADERS });
    }
    if (error instanceof GoogleOauthError || error instanceof GoogleServiceAccountError) {
      return Response.json({ error: "google_source_credentials_unavailable" }, { status: 503, headers: HEADERS });
    }
    if (error instanceof GoogleOfficialSourceReadError && error.code === "source_changed_during_read") {
      return Response.json({ error: "google_source_changed_during_read" }, { status: 409, headers: HEADERS });
    }
    if (error instanceof OfficialSourceHistoricalBaselineError) {
      return Response.json({ error: "google_source_historical_regression", code: error.code }, { status: 422, headers: HEADERS });
    }
    if (error instanceof SourceWorkbookContractError || error instanceof OfficialSourceContractError) {
      return Response.json({ error: "google_source_contract_invalid", code: error.code }, { status: 422, headers: HEADERS });
    }
    if (error instanceof SourcePostflightError) {
      return Response.json({ error: error.code }, { status: 422, headers: HEADERS });
    }
    if (error instanceof PersistenceGatewayError) {
      // Older Edge deployments may lack this read-only action. Fail closed;
      // never fake zero rows or assume a successful reconciliation.
      return Response.json({ error: "source_postflight_unavailable" }, { status: 503, headers: HEADERS });
    }
    return Response.json({ error: "source_postflight_unavailable" }, { status: 503, headers: HEADERS });
  }
}
