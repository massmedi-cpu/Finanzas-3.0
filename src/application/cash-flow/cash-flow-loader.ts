import {
  callPersistenceGateway,
  callPersistenceGatewayBatch,
  type PersistenceGatewayOperation,
} from "../../infrastructure/persistence/vercel-supabase-gateway";
import {
  assembleCashFlow,
  cashFlowMonth,
  isTransactionPage,
  type CashFlowTransaction,
  type CashFlowView,
  type TransactionPage,
} from "./cash-flow-model";

const PAGE_SIZE = 100;
const MAX_DAILY_ROWS = 2000;

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function transactionPayload(dateFrom: string, dateTo: string, cursor: TransactionPage["nextCursor"] = null) {
  return {
    dateFrom, dateTo,
    cursorBankDate: cursor?.bankDate ?? null,
    cursorId: cursor?.id ?? null,
    limit: PAGE_SIZE,
  };
}

export async function loadCashFlow(rawMonth: string | null | undefined): Promise<CashFlowView & { invalidMonth: boolean }> {
  const selection = cashFlowMonth(rawMonth, madridToday());
  const { month, dateFrom, dateTo, invalid } = selection;
  const operations: PersistenceGatewayOperation[] = [
    { action: "financial.period", payload: { dateFrom, dateTo, accountId: null } },
    { action: "transaction.query", payload: transactionPayload(dateFrom, dateTo) },
    { action: "forecast.snapshot", payload: { dateFrom, dateTo, accountId: null } },
  ];

  let period: unknown = null;
  let forecast: unknown = null;
  let transactionState: "complete" | "incomplete" | "unavailable" = "unavailable";
  let transactions: CashFlowTransaction[] | null = null;

  try {
    const [periodResult, transactionResult, forecastResult] = await callPersistenceGatewayBatch(operations);
    if (periodResult.status === "fulfilled") period = periodResult.value;
    if (forecastResult.status === "fulfilled") forecast = forecastResult.value;

    if (transactionResult.status === "fulfilled" && isTransactionPage(transactionResult.value)) {
      const first = transactionResult.value;
      if (first.totalCount > MAX_DAILY_ROWS) {
        transactionState = "incomplete";
      } else {
        let page: TransactionPage = first;
        const rows = [...first.rows];
        const seenCursors = new Set<string>();
        transactionState = "complete";
        while (page.hasMore) {
          const cursor = page.nextCursor;
          const cursorKey = `${cursor?.bankDate}:${cursor?.id}`;
          if (!cursor || seenCursors.has(cursorKey) || rows.length >= MAX_DAILY_ROWS) {
            transactionState = "incomplete";
            break;
          }
          seenCursors.add(cursorKey);
          try {
            const next: unknown = await callPersistenceGateway("transaction.query", transactionPayload(dateFrom, dateTo, cursor));
            if (!isTransactionPage(next) || next.totalCount !== first.totalCount || next.rows.length === 0) {
              transactionState = "incomplete";
              break;
            }
            page = next;
            rows.push(...next.rows);
          } catch {
            transactionState = "incomplete";
            break;
          }
        }

        if (rows.length !== first.totalCount || new Set(rows.map((row) => row.id)).size !== rows.length
          || rows.some((row) => row.bankDate < dateFrom || row.bankDate > dateTo)) {
          transactionState = "incomplete";
        }
        if (transactionState === "complete") transactions = rows;
      }
    }
  } catch {
    // El servidor local puede no disponer de identidad OIDC. No se muestran cifras de demostración.
  }

  return {
    ...assembleCashFlow({ month, dateFrom, dateTo, period, forecast, transactions, transactionState }),
    invalidMonth: invalid,
  };
}
