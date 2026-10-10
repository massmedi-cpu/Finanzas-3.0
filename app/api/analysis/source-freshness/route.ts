import {
  callPersistenceGateway,
  callPersistenceGatewayBatch,
  PersistenceGatewayError,
} from "../../../../src/infrastructure/persistence/vercel-supabase-gateway";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex",
};

function timingHeaders(started: number) {
  const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);
  return { ...HEADERS, "server-timing": "analysis-source-freshness;dur=" + durationMs };
}

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function transactionDate(payload: unknown) {
  const root = record(payload);
  const rows = Array.isArray(root?.rows) ? root.rows : [];
  const first = record(rows[0]);
  return text(first?.bankDate) ?? text(first?.bank_date);
}

function connectionSourceFileId(payload: unknown) {
  const connection = record(record(payload)?.connection);
  return text(connection?.source_file_id) ?? text(connection?.sourceFileId);
}

export function syncSummary(payload: unknown) {
  const run = record(record(payload)?.run);
  if (!run) return null;

  const status = text(run.status);
  if (status !== "success" && status !== "failed" && status !== "started" && status !== "partial") return null;

  return {
    status,
    finishedAt: text(run.finished_at) ?? text(run.finishedAt),
    startedAt: text(run.started_at) ?? text(run.startedAt),
    rowsSeen: integer(run.rows_seen) ?? integer(run.rowsSeen),
    rowsFailed: integer(run.rows_failed) ?? integer(run.rowsFailed),
    rowsMissing: integer(run.rows_missing) ?? integer(run.rowsMissing),
    duplicatesDetected: integer(run.duplicates_detected) ?? integer(run.duplicatesDetected),
    warningsCount: integer(run.warnings_count) ?? integer(run.warningsCount),
  };
}

function logGatewayFailure(scope: string, error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    console.warn(scope, { status: error.status, code: error.code ?? null });
    return;
  }
  console.warn(scope, error instanceof Error ? error.message : String(error));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const started = performance.now();

  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "accountId") || params.getAll("accountId").length > 1) {
      return Response.json({ error: "invalid_parameter" }, { status: 400, headers: timingHeaders(started) });
    }
    const accountId = params.get("accountId")?.trim() || null;
    if (accountId && !UUID.test(accountId)) {
      return Response.json({ error: "invalid_account_id" }, { status: 400, headers: timingHeaders(started) });
    }
    const [connectionResult, transactionResult] = await callPersistenceGatewayBatch([
      { action: "source.google_connection_status" },
      { action: "transaction.date_bounds", payload: { accountId } },
    ]);
    let earliestMovementDate: string | null = null;
    let latestMovementDate: string | null = null;

    if (transactionResult?.status === "fulfilled") {
      const bounds = record(transactionResult.value);
      earliestMovementDate = text(bounds?.earliestMovementDate);
      latestMovementDate = text(bounds?.latestMovementDate);
    } else if (transactionResult?.status === "rejected") {
      // Older gateway deployments do not know date_bounds. Preserve the
      // current best-effort latest date until the isolated backend is upgraded.
      logGatewayFailure("analysis-source-freshness-bounds", transactionResult.reason);
      try {
        const legacy = await callPersistenceGateway<unknown>("transaction.query", { limit: 1, accountId });
        latestMovementDate = transactionDate(legacy);
      } catch (error) {
        logGatewayFailure("analysis-source-freshness-legacy", error);
      }
    }

    if (connectionResult?.status !== "fulfilled") {
      if (connectionResult?.status === "rejected") {
        logGatewayFailure("analysis-source-freshness-connection", connectionResult.reason);
      }
      return Response.json(
        { available: Boolean(latestMovementDate), earliestMovementDate, latestMovementDate, sync: null },
        { headers: timingHeaders(started) },
      );
    }

    const sourceFileId = connectionSourceFileId(connectionResult.value);
    if (!sourceFileId) {
      return Response.json(
        { available: Boolean(latestMovementDate), earliestMovementDate, latestMovementDate, sync: null },
        { headers: timingHeaders(started) },
      );
    }

    try {
      const statusPayload = await callPersistenceGateway<unknown>("source.status", { sourceFileId });
      const sync = syncSummary(statusPayload);
      return Response.json(
        { available: Boolean(sync || latestMovementDate), earliestMovementDate, latestMovementDate, sync },
        { headers: timingHeaders(started) },
      );
    } catch (error) {
      logGatewayFailure("analysis-source-freshness-status", error);
      return Response.json(
        { available: Boolean(latestMovementDate), earliestMovementDate, latestMovementDate, sync: null },
        { headers: timingHeaders(started) },
      );
    }
  } catch (error) {
    logGatewayFailure("analysis-source-freshness", error);
    return Response.json(
      { available: false, earliestMovementDate: null, latestMovementDate: null, sync: null },
      { headers: timingHeaders(started) },
    );
  }
}
