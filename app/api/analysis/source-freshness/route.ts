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
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
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

function syncSummary(payload: unknown) {
  const run = record(record(payload)?.run);
  if (!run) return null;

  const status = text(run.status);
  if (status !== "success" && status !== "failed" && status !== "started") return null;

  return {
    status,
    finishedAt: text(run.finished_at) ?? text(run.finishedAt),
    startedAt: text(run.started_at) ?? text(run.startedAt),
    rowsSeen: integer(run.rows_seen) ?? integer(run.rowsSeen),
    rowsFailed: integer(run.rows_failed) ?? integer(run.rowsFailed),
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

export async function GET() {
  const started = performance.now();

  try {
    const [connectionResult, transactionResult] = await callPersistenceGatewayBatch([
      { action: "source.google_connection_status" },
      { action: "transaction.query", payload: { limit: 1 } },
    ]);

    const latestMovementDate = transactionResult?.status === "fulfilled"
      ? transactionDate(transactionResult.value)
      : null;

    if (transactionResult?.status === "rejected") {
      logGatewayFailure("analysis-source-freshness-transactions", transactionResult.reason);
    }

    if (connectionResult?.status !== "fulfilled") {
      if (connectionResult?.status === "rejected") {
        logGatewayFailure("analysis-source-freshness-connection", connectionResult.reason);
      }
      return Response.json(
        { available: false, latestMovementDate, sync: null },
        { headers: HEADERS },
      );
    }

    const sourceFileId = connectionSourceFileId(connectionResult.value);
    if (!sourceFileId) {
      return Response.json(
        { available: false, latestMovementDate, sync: null },
        { headers: HEADERS },
      );
    }

    try {
      const statusPayload = await callPersistenceGateway<unknown>("source.status", { sourceFileId });
      const sync = syncSummary(statusPayload);
      const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);
      return Response.json(
        { available: Boolean(sync || latestMovementDate), latestMovementDate, sync },
        {
          headers: {
            ...HEADERS,
            "server-timing": `analysis-source-freshness;dur=${durationMs}`,
          },
        },
      );
    } catch (error) {
      logGatewayFailure("analysis-source-freshness-status", error);
      return Response.json(
        { available: Boolean(latestMovementDate), latestMovementDate, sync: null },
        { headers: HEADERS },
      );
    }
  } catch (error) {
    logGatewayFailure("analysis-source-freshness", error);
    return Response.json(
      { available: false, latestMovementDate: null, sync: null },
      { headers: HEADERS },
    );
  }
}
