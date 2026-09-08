export type AnalysisPeriod = {
  dateFrom: string;
  dateTo: string;
  incomeCents: number;
  expenseCents: number;
  operatingNetCents: number;
  savingsCents: number;
  savingsRateBps: number | null;
};

export type AnalysisTransactionRow = {
  id: string;
  bankDate: string;
  amountCents: number;
  category: { effectiveId: string | null; effectiveName: string | null };
  merchant: { effectiveId: string | null; effectiveName: string | null };
  kind: { effective: string };
  duplicateState: string;
  excludedFromAnalytics: boolean;
};

export type AnalysisDriver = {
  id: string | null;
  name: string;
  expenseCents: number;
  shareBps: number | null;
  rows: number;
  href: string | null;
};

export type AnalysisSnapshot = {
  contractVersion: 1;
  month: string;
  current: AnalysisPeriod;
  previous: AnalysisPeriod;
  comparison: {
    incomeDeltaCents: number;
    incomeChangeBps: number | null;
    expenseDeltaCents: number;
    expenseChangeBps: number | null;
    netDeltaCents: number;
    netChangeBps: number | null;
  };
  categoryDrivers: AnalysisDriver[];
  merchantDrivers: AnalysisDriver[];
  quality: {
    expenseRows: number;
    excludedRows: number;
    confirmedDuplicateRows: number;
    reconciled: boolean;
  };
  principles: {
    bankSource: "read_only";
    totals: "financial_period";
    drivers: "effective_transaction_query";
  };
};

function changeBps(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 10000) / Math.abs(previous));
}

function driverHref(
  dateFrom: string,
  dateTo: string,
  kind: "category" | "merchant",
  id: string | null,
) {
  if (kind === "merchant" && id === null) return null;
  const params = new URLSearchParams({ dateFrom, dateTo, kind: "expense" });
  if (kind === "category") params.set("categoryId", id ?? "__uncategorized__");
  else if (id) params.set("merchantId", id);
  return `/transactions?${params.toString()}`;
}

function aggregateDrivers(
  rows: AnalysisTransactionRow[],
  dateFrom: string,
  dateTo: string,
  kind: "category" | "merchant",
  totalExpenseCents: number,
) {
  const grouped = new Map<string, { id: string | null; name: string; expenseCents: number; rows: number }>();
  for (const row of rows) {
    const ref = kind === "category" ? row.category : row.merchant;
    const key = ref.effectiveId ?? "__none__";
    const current = grouped.get(key) ?? {
      id: ref.effectiveId,
      name: ref.effectiveName ?? (kind === "category" ? "Sin categoría" : "Sin comercio"),
      expenseCents: 0,
      rows: 0,
    };
    current.expenseCents += -row.amountCents;
    current.rows += 1;
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map<AnalysisDriver>((driver) => ({
      ...driver,
      shareBps: totalExpenseCents > 0 ? Math.round((driver.expenseCents * 10000) / totalExpenseCents) : null,
      href: driverHref(dateFrom, dateTo, kind, driver.id),
    }))
    .sort((a, b) => b.expenseCents - a.expenseCents || a.name.localeCompare(b.name, "es"));
}

export function buildAnalysisSnapshot(input: {
  month: string;
  current: AnalysisPeriod;
  previous: AnalysisPeriod;
  expenseRows: AnalysisTransactionRow[];
}): AnalysisSnapshot {
  const eligibleExpenses = input.expenseRows.filter(
    (row) => row.kind.effective === "expense" && row.duplicateState !== "confirmed" && !row.excludedFromAnalytics,
  );
  const excludedRows = input.expenseRows.filter((row) => row.excludedFromAnalytics).length;
  const confirmedDuplicateRows = input.expenseRows.filter((row) => row.duplicateState === "confirmed").length;
  const driverExpenseCents = eligibleExpenses.reduce((sum, row) => sum - row.amountCents, 0);
  const reconciled = driverExpenseCents === input.current.expenseCents;
  if (!reconciled) throw new Error("analysis_reconciliation_failed");

  return {
    contractVersion: 1,
    month: input.month,
    current: input.current,
    previous: input.previous,
    comparison: {
      incomeDeltaCents: input.current.incomeCents - input.previous.incomeCents,
      incomeChangeBps: changeBps(input.current.incomeCents, input.previous.incomeCents),
      expenseDeltaCents: input.current.expenseCents - input.previous.expenseCents,
      expenseChangeBps: changeBps(input.current.expenseCents, input.previous.expenseCents),
      netDeltaCents: input.current.operatingNetCents - input.previous.operatingNetCents,
      netChangeBps: changeBps(input.current.operatingNetCents, input.previous.operatingNetCents),
    },
    categoryDrivers: aggregateDrivers(
      eligibleExpenses,
      input.current.dateFrom,
      input.current.dateTo,
      "category",
      input.current.expenseCents,
    ),
    merchantDrivers: aggregateDrivers(
      eligibleExpenses,
      input.current.dateFrom,
      input.current.dateTo,
      "merchant",
      input.current.expenseCents,
    ),
    quality: {
      expenseRows: input.expenseRows.length,
      excludedRows,
      confirmedDuplicateRows,
      reconciled,
    },
    principles: {
      bankSource: "read_only",
      totals: "financial_period",
      drivers: "effective_transaction_query",
    },
  };
}
