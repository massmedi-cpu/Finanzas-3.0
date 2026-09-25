import { isForecastSnapshot, type ForecastItem, type ForecastSnapshot } from "../forecast/forecast-contract";

export type CashFlowTransaction = {
  id: string;
  bankDate: string;
  amountCents: number;
  account: { id: string; name: string };
  concept: { effective: string };
  kind: { effective: "income" | "expense" | "transfer" | "refund" | "adjustment" };
  duplicateState: "none" | "suspected" | "confirmed";
  excludedFromAnalytics: boolean;
};

export type TransactionPage = {
  rows: CashFlowTransaction[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: { bankDate: string; id: string } | null;
};

export type FinancialPeriod = {
  dateFrom: string;
  dateTo: string;
  accountId: null;
  operatingNetCents: number;
  quality: { scopedRows: number; includedRows: number };
};

export type CashFlowDay = {
  date: string;
  realIncomeCents: number;
  realExpenseCents: number;
  realNetCents: number;
  plannedIncomeCents: number;
  plannedExpenseCents: number;
  plannedNetCents: number;
  real: CashFlowTransaction[];
  forecasts: ForecastItem[];
};

export type CashFlowEventState = "suggested" | "confirmed" | "realized" | "discarded";

export type CashFlowEvolutionPoint = {
  date: string;
  realCumulativeCents: number | null;
  plannedCumulativeCents: number | null;
  combinedCumulativeCents: number | null;
};

export type CashFlowForecastCounts = Record<CashFlowEventState, number>;

export type CashFlowView = {
  month: string;
  dateFrom: string;
  dateTo: string;
  actualState: "ready" | "unavailable" | "incomplete" | "mismatch";
  forecastState: "ready" | "unavailable" | "mismatch";
  actualIncomeCents: number | null;
  actualExpenseCents: number | null;
  actualNetCents: number | null;
  plannedIncomeCents: number | null;
  plannedExpenseCents: number | null;
  plannedNetCents: number | null;
  realCount: number | null;
  forecastCounts: CashFlowForecastCounts | null;
  days: CashFlowDay[];
  evolution: CashFlowEvolutionPoint[];
};

export function cashFlowMonth(raw: string | null | undefined, today: string) {
  const fallback = today.slice(0, 7);
  const valid = typeof raw === "string" && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(raw);
  const month = valid ? raw : fallback;
  const [year, number] = month.split("-").map(Number);
  const dateFrom = `${month}-01`;
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { month, dateFrom, dateTo: `${month}-${String(days).padStart(2, "0")}`, invalid: Boolean(raw) && !valid };
}

export function shiftCashFlowMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

function isTransaction(value: unknown): value is CashFlowTransaction {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CashFlowTransaction>;
  return typeof row.id === "string" && typeof row.bankDate === "string"
    && Number.isSafeInteger(row.amountCents)
    && typeof row.concept?.effective === "string"
    && typeof row.account?.name === "string"
    && ["income", "expense", "transfer", "refund", "adjustment"].includes(row.kind?.effective ?? "")
    && ["none", "suspected", "confirmed"].includes(row.duplicateState ?? "")
    && typeof row.excludedFromAnalytics === "boolean";
}

export function isTransactionPage(value: unknown): value is TransactionPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<TransactionPage>;
  return Array.isArray(page.rows) && page.rows.every(isTransaction)
    && Number.isSafeInteger(page.totalCount) && (page.totalCount ?? -1) >= 0
    && typeof page.hasMore === "boolean"
    && (page.nextCursor === null || (
      typeof page.nextCursor?.bankDate === "string" && typeof page.nextCursor.id === "string"
    ));
}

function isFinancialPeriod(value: unknown, dateFrom: string, dateTo: string): value is FinancialPeriod {
  if (!value || typeof value !== "object") return false;
  const period = value as Partial<FinancialPeriod>;
  return period.dateFrom === dateFrom && period.dateTo === dateTo && period.accountId === null
    && Number.isSafeInteger(period.operatingNetCents)
    && Number.isSafeInteger(period.quality?.includedRows)
    && Number.isSafeInteger(period.quality?.scopedRows);
}

function isCashFlowForecast(value: unknown, dateFrom: string, dateTo: string): value is ForecastSnapshot {
  if (!isForecastSnapshot(value) || value.period.dateFrom !== dateFrom || value.period.dateTo !== dateTo
    || value.period.accountId !== null || value.principles.confirmedItemsAffectCashFlow !== false
    || value.principles.excludedItemsAffectCashFlow !== false
    || !Number.isSafeInteger(value.summary?.projectedNetCents)) return false;
  return value.items.every((item) =>
    typeof item.id === "string" && typeof item.concept === "string"
    && item.date >= dateFrom && item.date <= dateTo
    && Number.isSafeInteger(item.amountCents) && Number.isSafeInteger(item.projectionEffectCents)
    && ["planned", "excluded", "confirmed"].includes(item.status)
    && (item.status === "planned" ? item.projectionEffectCents === item.amountCents : item.projectionEffectCents === 0)
    && (item.actual === null || (typeof item.actual?.date === "string" && Number.isSafeInteger(item.actual.amountCents)))
    && (item.status !== "confirmed" || (item.confirmedTransactionId !== null && item.actual !== null))
  );
}

export function countsInCashFlow(row: CashFlowTransaction) {
  return !row.excludedFromAnalytics && row.duplicateState !== "confirmed" && row.kind.effective !== "transfer";
}

export function cashFlowEventState(item: ForecastItem): CashFlowEventState {
  if (item.status === "excluded") return "discarded";
  if (item.status === "confirmed") return "realized";
  return item.origin === "manual" || item.origin === "known" ? "confirmed" : "suggested";
}

export function assembleCashFlow(input: {
  month: string;
  dateFrom: string;
  dateTo: string;
  transactions: CashFlowTransaction[] | null;
  transactionState: "complete" | "incomplete" | "unavailable";
  period: unknown;
  forecast: unknown;
}): CashFlowView {
  const { month, dateFrom, dateTo, transactions, transactionState } = input;
  const periodValid = isFinancialPeriod(input.period, dateFrom, dateTo);
  const forecast = isCashFlowForecast(input.forecast, dateFrom, dateTo) ? input.forecast : null;
  const actualRows = transactions ?? [];
  const eligible = actualRows.filter((row) => !row.excludedFromAnalytics && row.duplicateState !== "confirmed");
  const cashFlowRows = actualRows.filter(countsInCashFlow);
  const derivedRealIncome = cashFlowRows.reduce((sum, row) => sum + Math.max(0, row.amountCents), 0);
  const derivedRealExpense = cashFlowRows.reduce((sum, row) => sum - Math.min(0, row.amountCents), 0);
  const derivedRealNet = derivedRealIncome - derivedRealExpense;
  const actualState = transactionState === "unavailable" || !periodValid ? "unavailable"
    : transactionState === "incomplete" || transactions === null ? "incomplete"
      : derivedRealNet === (input.period as FinancialPeriod).operatingNetCents
        && eligible.length === (input.period as FinancialPeriod).quality.includedRows
        && actualRows.length === (input.period as FinancialPeriod).quality.scopedRows ? "ready" : "mismatch";
  const derivedPlannedNet = forecast?.items.reduce((sum, item) => sum + item.projectionEffectCents, 0);
  const derivedPlannedIncome = forecast?.items.reduce((sum, item) => sum + Math.max(0, item.projectionEffectCents), 0);
  const derivedPlannedExpense = forecast?.items.reduce((sum, item) => sum - Math.min(0, item.projectionEffectCents), 0);
  const forecastState = !forecast ? "unavailable"
    : derivedPlannedNet === forecast.summary.projectedNetCents
      && derivedPlannedIncome === forecast.summary.projectedIncomeCents
      && derivedPlannedExpense === forecast.summary.projectedExpenseCents
      && forecast.summary.plannedItems === forecast.items.filter((item) => item.status === "planned").length
      && forecast.summary.confirmedItems === forecast.items.filter((item) => item.status === "confirmed").length
      && forecast.summary.excludedItems === forecast.items.filter((item) => item.status === "excluded").length
      && new Set(forecast.items.map((item) => item.id)).size === forecast.items.length ? "ready" : "mismatch";

  const transactionsByDate = new Map<string, CashFlowTransaction[]>();
  for (const row of actualRows) {
    const rows = transactionsByDate.get(row.bankDate) ?? [];
    rows.push(row);
    transactionsByDate.set(row.bankDate, rows);
  }
  const forecastsByDate = new Map<string, ForecastItem[]>();
  for (const item of forecast?.items ?? []) {
    const items = forecastsByDate.get(item.date) ?? [];
    items.push(item);
    forecastsByDate.set(item.date, items);
  }

  const days: CashFlowDay[] = [];
  for (let day = dateFrom; day <= dateTo;) {
    const real = transactionsByDate.get(day) ?? [];
    const forecasts = forecastsByDate.get(day) ?? [];
    const effects = actualState === "ready" ? real.filter(countsInCashFlow) : [];
    const planned = forecastState === "ready" ? forecasts : [];
    const realIncomeCents = effects.reduce((sum, row) => sum + Math.max(0, row.amountCents), 0);
    const realExpenseCents = effects.reduce((sum, row) => sum + Math.min(0, row.amountCents), 0);
    const plannedIncomeCents = planned.reduce((sum, item) => sum + Math.max(0, item.projectionEffectCents), 0);
    const plannedExpenseCents = planned.reduce((sum, item) => sum + Math.min(0, item.projectionEffectCents), 0);
    days.push({ date: day, realIncomeCents, realExpenseCents, realNetCents: realIncomeCents + realExpenseCents,
      plannedIncomeCents, plannedExpenseCents, plannedNetCents: plannedIncomeCents + plannedExpenseCents,
      real, forecasts });
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }

  let realCumulativeCents = 0;
  let plannedCumulativeCents = 0;
  const evolution = days.map((day): CashFlowEvolutionPoint => {
    realCumulativeCents += day.realNetCents;
    plannedCumulativeCents += day.plannedNetCents;
    return {
      date: day.date,
      realCumulativeCents: actualState === "ready" ? realCumulativeCents : null,
      plannedCumulativeCents: forecastState === "ready" ? plannedCumulativeCents : null,
      combinedCumulativeCents: actualState === "ready" && forecastState === "ready"
        ? realCumulativeCents + plannedCumulativeCents
        : null,
    };
  });

  const forecastCounts = forecastState === "ready" && forecast ? forecast.items.reduce<CashFlowForecastCounts>(
    (counts, item) => {
      const state = cashFlowEventState(item);
      return { ...counts, [state]: counts[state] + 1 };
    },
    { suggested: 0, confirmed: 0, realized: 0, discarded: 0 },
  ) : null;

  return {
    month, dateFrom, dateTo, actualState, forecastState,
    actualIncomeCents: actualState === "ready" ? derivedRealIncome : null,
    actualExpenseCents: actualState === "ready" ? derivedRealExpense : null,
    actualNetCents: actualState === "ready" ? derivedRealNet : null,
    plannedIncomeCents: forecastState === "ready" ? derivedPlannedIncome ?? null : null,
    plannedExpenseCents: forecastState === "ready" ? derivedPlannedExpense ?? null : null,
    plannedNetCents: forecastState === "ready" ? derivedPlannedNet ?? null : null,
    realCount: actualState === "ready" ? actualRows.length : null,
    forecastCounts,
    days,
    evolution,
  };
}
