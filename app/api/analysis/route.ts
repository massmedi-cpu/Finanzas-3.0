import {
  callPersistenceGateway,
  PersistenceGatewayError,
} from "../../../src/infrastructure/persistence/vercel-supabase-gateway";
import {
  buildAnalysisSnapshot,
  type AnalysisPeriod,
  type AnalysisTransactionRow,
} from "../../../src/application/analysis/analysis-engine";

export const dynamic = "force-dynamic";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_DRIVER_PAGES = 50;

function madridMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}`;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function previousMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const previous = monthNumber === 1 ? { year: year - 1, month: 12 } : { year, month: monthNumber - 1 };
  return `${previous.year}-${String(previous.month).padStart(2, "0")}`;
}

type TransactionPage = {
  rows?: AnalysisTransactionRow[];
  hasMore?: boolean;
  nextCursor?: { bankDate?: string; id?: string } | null;
};

async function readExpenseRows(dateFrom: string, dateTo: string) {
  const rows: AnalysisTransactionRow[] = [];
  let cursor: { bankDate: string; id: string } | null = null;

  for (let page = 0; page < MAX_DRIVER_PAGES; page += 1) {
    const result = await callPersistenceGateway<TransactionPage>("transaction.query", {
      kind: "expense",
      dateFrom,
      dateTo,
      limit: 100,
      cursorBankDate: cursor?.bankDate ?? null,
      cursorId: cursor?.id ?? null,
    });
    if (Array.isArray(result.rows)) rows.push(...result.rows);
    if (result.hasMore !== true) return rows;
    if (!result.nextCursor?.bankDate || !result.nextCursor?.id) throw new Error("analysis_invalid_cursor");
    cursor = { bankDate: result.nextCursor.bankDate, id: result.nextCursor.id };
  }

  throw new Error("analysis_driver_page_limit_exceeded");
}

function apiError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    return Response.json(
      { error: "analysis_unavailable", code: error.code ?? null },
      {
        status: error.status >= 400 && error.status < 600 ? error.status : 503,
        headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
      },
    );
  }
  const code = error instanceof Error ? error.message : "analysis_invalid_request";
  const status = code === "analysis_reconciliation_failed" ? 503 : 400;
  console.error("analysis-api", code);
  return Response.json(
    { error: status === 503 ? "analysis_unavailable" : "invalid_request", code },
    { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    for (const key of searchParams.keys()) {
      if (key !== "month") throw new Error("invalid_analysis_parameter");
    }
    const month = searchParams.get("month")?.trim() || madridMonth();
    if (!MONTH.test(month)) throw new Error("invalid_analysis_month");

    const currentBounds = monthBounds(month);
    const previous = previousMonth(month);
    const previousBounds = monthBounds(previous);

    const [currentPeriod, previousPeriod, expenseRows] = await Promise.all([
      callPersistenceGateway<AnalysisPeriod>("financial.period", currentBounds),
      callPersistenceGateway<AnalysisPeriod>("financial.period", previousBounds),
      readExpenseRows(currentBounds.dateFrom, currentBounds.dateTo),
    ]);

    const snapshot = buildAnalysisSnapshot({
      month,
      current: currentPeriod,
      previous: previousPeriod,
      expenseRows,
    });

    return Response.json(snapshot, {
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  } catch (error) {
    return apiError(error);
  }
}
