import {
  OfficialSourceHistoricalBaselineError,
  assertOfficialSourceHistoricalBaseline,
  buildOfficialSourcePreflightSummary,
} from "../../../../../src/application/source-preflight";
import {
  isConfirmedSourcePreflight, isSourcePreflightConfirmation,
  matchesSourcePreflightConfirmation, isSourceSyncResultForPreflight,
} from "../../../../../src/application/source-confirmation-contract";
import { LimitedJsonRequestError, readLimitedJsonRequest } from "../../../../../src/infrastructure/http/limited-json-request";
import { SourceWorkbookContractError } from "../../../../../src/application/source-sync-service";
import {
  SourceDateRepresentationAuditError, prepareVerifiedAppendOnlySourcePlan,
  verifyPlannedAppendOnlyPostflight,
  type VerifiedAppendOnlySourcePlan,
} from "../../../../../src/application/source-date-representation-audit";
import { buildSourcePostflightReport } from "../../../../../src/application/source-postflight-report";
import { SourcePostflightError } from "../../../../../src/domain/source-postflight-reconciliation";
import {
  isSafeAppendOnlySourceBaseline, isCompleteSourceSyncPostflight,
} from "../../../../../src/application/source-sync-postflight-policy";
import { OfficialSourceContractError } from "../../../../../src/domain/official-bank-source";
import {
  SourceSyncRuntimeCompatibilityError,
  assertSourceSyncRuntimeCapabilities,
  type SourceSyncRuntimeCapabilities,
} from "../../../../../src/application/source-sync-runtime-contract";
import { GoogleOauthError } from "../../../../../src/infrastructure/google/google-oauth";
import {
  OFFICIAL_GOOGLE_SOURCE_FILE_ID,
  GoogleSourceConnectionContractError,
  GoogleSourceRuntimeConfigurationError,
  createGoogleSourceRuntime,
  resolveGoogleSourceConnection,
} from "../../../../../src/infrastructure/google/google-source-runtime";
import { GoogleServiceAccountError } from "../../../../../src/infrastructure/google/google-service-account";
import { GoogleOfficialSourceReadError } from "../../../../../src/infrastructure/google/official-bank-source-reader";
import {
  PersistenceGatewayError,
  callPersistenceGateway,
} from "../../../../../src/infrastructure/persistence/vercel-supabase-gateway";
import { requireSourceSession, requireVerifiedSourceWorkspace, sourceWorkspaceAuthError } from "../../../../../src/infrastructure/auth/source-metadata-access";

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
    rows_missing: number;
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

type SourceConnectionResolver = () => Promise<{ sourceFileId: string } | null>;

const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex" };

export async function resolveSourceStatusFileId(
  resolveConnection: SourceConnectionResolver = resolveGoogleSourceConnection,
) {
  try {
    const connection = await resolveConnection();
    return connection?.sourceFileId ?? OFFICIAL_GOOGLE_SOURCE_FILE_ID;
  } catch (error) {
    if (
      error instanceof GoogleSourceRuntimeConfigurationError ||
      error instanceof GoogleSourceConnectionContractError ||
      error instanceof PersistenceGatewayError
    ) {
      return OFFICIAL_GOOGLE_SOURCE_FILE_ID;
    }
    throw error;
  }
}

export async function GET() {
  const denied = await requireVerifiedSourceWorkspace();
  if (denied) return denied;

  try {
    const sourceFileId = await resolveSourceStatusFileId();
    const status = await callPersistenceGateway<GatewaySourceStatus>("source.status", {
      sourceFileId,
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
              rowsMissing: status.run.rows_missing,
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
      { headers: HEADERS },
    );
  } catch (error) {
    const denied = sourceWorkspaceAuthError(error);
    if (denied) return denied;

    console.error(
      "google-source-status",
      error instanceof PersistenceGatewayError
        ? error.code ?? error.name
        : error instanceof Error
          ? error.name
          : "unknown_error",
    );
    return Response.json(
      { error: "source_status_unavailable" },
      { status: 503, headers: HEADERS },
    );
  }
}

export async function POST(request: Request) {
  // Reject anonymous callers before resolving Google service-account state.
  // Verify workspace membership before resolving any Google connection metadata.
  const missingSession = await requireSourceSession();
  if (missingSession) return missingSession;

  try {
    const confirmation = await readLimitedJsonRequest(request, 2048);
    if (!isSourcePreflightConfirmation(confirmation)) {
      return Response.json({ error: "google_source_preflight_required" }, { status: 400, headers: HEADERS });
    }
    const capabilities = await callPersistenceGateway<SourceSyncRuntimeCapabilities>("source.capabilities");
    assertSourceSyncRuntimeCapabilities(capabilities);

    const connection = await resolveGoogleSourceConnection();
    if (!connection) {
      return Response.json({ error: "google_oauth_not_connected" }, { status: 409, headers: HEADERS });
    }

    const runtime = createGoogleSourceRuntime(connection.sourceFileId);
    const snapshot = await runtime.reader.read();
    // This is a fresh, server-side, read-only check. A previous UI preflight
    // never authorizes persistence of a newer or malformed workbook.
    const summary = assertOfficialSourceHistoricalBaseline(buildOfficialSourcePreflightSummary(snapshot));
    if (!isConfirmedSourcePreflight(summary)) {
      return Response.json(
        { error: "google_source_contract_invalid", code: "source_preflight_invalid" },
        { status: 422, headers: HEADERS },
      );
    }
    if (!matchesSourcePreflightConfirmation(confirmation, summary)) {
      return Response.json({ error: "google_source_preflight_changed" }, { status: 409, headers: HEADERS });
    }
    // REC-SYNC-352: never silently rewrite an already stored historical row
    // while importing new official movements. A row hash difference, including
    // a changed cell representation, is review evidence, not an auto-fix.
    const persistedBefore = await callPersistenceGateway<unknown>("source.postflight_rows", {
      sourceFileId: summary.sourceFileId,
    });
    const beforeReport = buildSourcePostflightReport(snapshot, persistedBefore);
    let verifiedPlan: VerifiedAppendOnlySourcePlan | null = null;
    if (!isSafeAppendOnlySourceBaseline(beforeReport)) {
      // Only fingerprint-only differences are candidates for independent full
      // original verification. All other changes fail closed without mutation.
      const representationCandidate =
        beforeReport.orphanRows === 0 && beforeReport.differingRows > 0
        && beforeReport.differences.sourceFingerprint === beforeReport.differingRows
        && Object.entries(beforeReport.differences).every(
          ([field, count]) => field === "sourceFingerprint" || count === 0,
        )
        && beforeReport.persistedRows === beforeReport.matchingRows + beforeReport.differingRows
        && beforeReport.sourceRows === beforeReport.persistedRows + beforeReport.pendingRows;
      if (!representationCandidate) {
        return Response.json({ error: "google_source_existing_rows_changed" }, { status: 409, headers: HEADERS });
      }
      if (capabilities.sourceImmutableOriginalRows !== true) {
        return Response.json({ error: "source_runtime_incompatible" }, { status: 503, headers: HEADERS });
      }
      const persistedOriginals = await callPersistenceGateway<unknown>("source.original_rows", {
        sourceFileId: summary.sourceFileId,
      });
      // REC-SYNC-450: authenticated, confirmed import may preserve existing
      // originals when ONLY Hora/Notas auxiliary metadata changed. Every
      // economic, review, category or merchant difference still fails closed.
      verifiedPlan = prepareVerifiedAppendOnlySourcePlan(snapshot, persistedOriginals, {
        allowAuxiliaryMetadataChanges: true,
      });
      // The separate eight-column persisted read must agree with the private
      // full-payload read. A race between reads rejects before SQL mutation.
      const canonicalBefore = verifyPlannedAppendOnlyPostflight(verifiedPlan, persistedBefore);
      if (!isSafeAppendOnlySourceBaseline(canonicalBefore)
        || canonicalBefore.matchingRows !== verifiedPlan.audit.persistedRows
        || canonicalBefore.pendingRows !== verifiedPlan.audit.pendingRows
        || verifiedPlan.preservedRepresentationRows !== verifiedPlan.audit.dateRepresentationRows
        || verifiedPlan.preservedAuxiliaryRows !== (verifiedPlan.audit.auxiliaryMetadataRows ?? 0)) {
        return Response.json({ error: "google_source_existing_rows_changed" }, { status: 409, headers: HEADERS });
      }
    }

    // Normal path remains strict and unchanged; the audited exceptional
    // path carries byte-identical original fingerprints into locked SQL.
    const result = verifiedPlan
      ? await runtime.synchronization.synchronizePreparedBatch(verifiedPlan.batch)
      : await runtime.synchronization.synchronize(snapshot);
    // The mutation may have committed. A malformed or unrelated receipt is
    // uncertain, never a promise of rollback and never retried automatically.
    if (!isSourceSyncResultForPreflight(result, summary)) {
      return Response.json({ error: "google_source_sync_unconfirmed" }, { status: 502, headers: HEADERS });
    }
    // REC-SYNC-353: a successful gateway receipt is not proof of complete
    // persistence. Read the actual stored rows again before claiming success.
    // This is a sequential comparison, NOT an atomic Google/Postgres snapshot.
    // Any failed read or inconsistent result leaves the mutation UNCONFIRMED;
    // callers must check status and never retry POST automatically.
    if (result.rowsRevised !== 0) {
      return Response.json({ error: "google_source_sync_unconfirmed" }, { status: 502, headers: HEADERS });
    }
    try {
      const persistedAfter = await callPersistenceGateway<unknown>("source.postflight_rows", {
        sourceFileId: summary.sourceFileId,
      });
      const afterReport = verifiedPlan
        ? verifyPlannedAppendOnlyPostflight(verifiedPlan, persistedAfter)
        : buildSourcePostflightReport(snapshot, persistedAfter);
      if (!isCompleteSourceSyncPostflight(afterReport)) {
        return Response.json({ error: "google_source_sync_unconfirmed" }, { status: 502, headers: HEADERS });
      }
      if (verifiedPlan) {
        // REC-SYNC-406: independent 22-cell reread, not just eight-field hashes.
        // Recalculate every source SHA; unchanged fingerprint with mutated JSONB
        // is NOT sufficient proof of immutable original payloads.
        const originalPayloadsAfter = await callPersistenceGateway<unknown>("source.original_rows", {
          sourceFileId: summary.sourceFileId,
        });
        const verifiedAfter = prepareVerifiedAppendOnlySourcePlan(snapshot, originalPayloadsAfter, {
          allowAuxiliaryMetadataChanges: true,
        });
        const originalAfterReport = verifyPlannedAppendOnlyPostflight(verifiedAfter, persistedAfter);
        if (verifiedAfter.audit.pendingRows !== 0
          || verifiedAfter.audit.persistedRows !== verifiedPlan.audit.sourceRows
          || verifiedAfter.audit.changedRows !== 0 || verifiedAfter.audit.orphanRows !== 0
          || verifiedAfter.audit.dateRepresentationRows !== verifiedPlan.audit.dateRepresentationRows
          || verifiedAfter.audit.auxiliaryMetadataRows !== verifiedPlan.audit.auxiliaryMetadataRows
          || !isCompleteSourceSyncPostflight(originalAfterReport)) {
          return Response.json({ error: "google_source_sync_unconfirmed" }, { status: 502, headers: HEADERS });
        }
      }
    } catch {
      // A write may already have committed. Never leak raw data or promise rollback.
      return Response.json({ error: "google_source_sync_unconfirmed" }, { status: 502, headers: HEADERS });
    }

    if (runtime.authMode === "oauth" && runtime.oauth) {
      await runtime.oauth.markVerified();
    }

    return Response.json(
      {
        ...result,
        sourceRevision: summary.sourceRevision,
        snapshotFingerprint: summary.snapshotFingerprint,
      },
      { headers: HEADERS },
    );
  } catch (error) {
    if (error instanceof LimitedJsonRequestError) {
      return Response.json({ error: "google_source_preflight_required" }, {
        status: error.reason === "too_large" ? 413 : 400, headers: HEADERS,
      });
    }
    const denied = sourceWorkspaceAuthError(error);
    if (denied) return denied;
    if (error instanceof GoogleSourceRuntimeConfigurationError) {
      return Response.json(
        { error: "google_oauth_not_configured", missing: error.missing },
        { status: 503, headers: HEADERS },
      );
    }
    if (error instanceof GoogleSourceConnectionContractError) {
      return Response.json({ error: "google_connection_contract_mismatch" }, { status: 409, headers: HEADERS });
    }
    if (error instanceof GoogleServiceAccountError) {
      return Response.json({ error: "google_service_account_unavailable" }, { status: 503, headers: HEADERS });
    }
    if (
      error instanceof SourceSyncRuntimeCompatibilityError ||
      (error instanceof PersistenceGatewayError && error.code === "unsupported_action")
    ) {
      return Response.json(
        { error: "source_runtime_incompatible" },
        { status: 503, headers: HEADERS },
      );
    }
    if (error instanceof PersistenceGatewayError && error.code === "google_source_existing_rows_changed") {
      // The Edge transaction rolled back a concurrent historical revision.
      return Response.json(
        { error: "google_source_existing_rows_changed" },
        { status: 409, headers: HEADERS },
      );
    }
    if (error instanceof PersistenceGatewayError && error.code === "google_oauth_not_connected") {
      return Response.json(
        { error: "google_oauth_not_connected" },
        { status: 409, headers: HEADERS },
      );
    }
    if (error instanceof GoogleOauthError && error.code === "google_reauthorization_required") {
      return Response.json(
        { error: "google_oauth_not_connected" },
        { status: 409, headers: HEADERS },
      );
    }
    if (
      error instanceof GoogleOauthError &&
      (error.code === "google_refresh_failed" || error.code === "google_token_response_invalid")
    ) {
      return Response.json(
        { error: "google_oauth_refresh_unavailable" },
        { status: 503, headers: HEADERS },
      );
    }
    if (error instanceof GoogleOfficialSourceReadError && error.code === "source_changed_during_read") {
      return Response.json(
        { error: "google_source_changed_during_read" },
        { status: 409, headers: HEADERS },
      );
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
    if (error instanceof SourceDateRepresentationAuditError) {
      return Response.json({ error: "google_source_existing_rows_changed" }, { status: 409, headers: HEADERS });
    }
    if (error instanceof SourcePostflightError) {
      return Response.json({ error: "source_postflight_invalid_record" }, { status: 409, headers: HEADERS });
    }
    if (error instanceof PersistenceGatewayError) {
      return Response.json({ error: "source_postflight_unavailable" }, { status: 503, headers: HEADERS });
    }
    console.error("google-source-sync", error instanceof Error ? error.name : "unknown_error");
    return Response.json(
      { error: "google_source_sync_failed" },
      { status: 500, headers: HEADERS },
    );
  }
}
