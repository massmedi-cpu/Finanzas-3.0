export type AnalysisRange = "1m" | "3m" | "6m" | "12m" | "ytd";

export type AnalysisPeriod = {
  dateFrom: string;
  dateTo: string;
  incomeCents: number;
  expenseCents: number;
  operatingNetCents: number;
  savingsCents: number;
  savingsRateBps: number | null;
  quality?: {
    scopedRows?: number;
    includedRows?: number;
    manuallyExcludedRows?: number;
    confirmedDuplicateRows?: number;
    suspectedDuplicateRows?: number;
    signMismatchRows?: number;
  };
};

export type AnalysisMonthlyRow = {
  monthStart: string;
  rows: number;
  incomeCents: number;
  expenseCents: number;
  operatingNetCents: number;
  savingsCents: number;
  savingsRateBps: number | null;
};

export type AnalysisAccount = {
  id: string;
  name: string;
  lifecycle: string;
};

export type AnalysisDriver = {
  id: string | null;
  name: string;
  expenseCents: number;
  previousExpenseCents: number;
  deltaCents: number;
  changeBps: number | null;
  shareBps: number | null;
  rows: number;
  previousRows: number;
  href: string | null;
};

export type AnalysisMerchantDriver = AnalysisDriver & {
  averageCents: number | null;
  habitualAverageCents: number | null;
  habitualRows: number;
  habitualVariationBps: number | null;
};

export type AnalysisTrend = {
  direction: "up" | "down" | "stable" | "insufficient";
  delta: number | null;
  recentAverage: number | null;
  previousAverage: number | null;
  sampleMonths: number;
};

export type AnalysisDailySpend = {
  date: string;
  expenseCents: number;
  rows: number;
};

export type AnalysisWeekdaySpend = {
  weekday: number;
  expenseCents: number;
  rows: number;
  averageCents: number;
};

export type AnalysisAmountBand = {
  band: "lt10" | "10to25" | "25to50" | "50to100" | "100to250" | "gte250";
  expenseCents: number;
  rows: number;
};

export type AnalysisConceptSummary = {
  concept: string;
  expenseCents: number;
  rows: number;
  averageCents: number;
};

export type AnalysisAccountSpend = {
  accountId: string;
  accountName: string;
  expenseCents: number;
  rows: number;
  averageCents: number;
};

export type AnalysisTopTransaction = {
  transactionId: string;
  bankDate: string;
  amountCents: number;
  conceptNormalized: string;
  conceptOriginal?: string | null;
  balanceAfterCents?: number | null;
  reviewState?: "confirmed" | "pending" | "needs_review" | null;
  duplicateState?: "none" | "suspected" | "confirmed" | null;
  hasManualOverride?: boolean;
  merchantId: string | null;
  merchantName: string;
  categoryId: string | null;
  categoryName: string;
  accountId: string;
  accountName: string;
};

export type AnalysisGatewaySnapshot = {
  current: AnalysisPeriod;
  previous: AnalysisPeriod;
  history: {
    rows: Array<Omit<AnalysisMonthlyRow, "savingsRateBps"> & { savingsRateBps?: number | null }>;
  };
  accounts: AnalysisAccount[];
  categories: Array<{
    id: string | null;
    name: string;
    currentExpenseCents: number;
    previousExpenseCents: number;
    currentRows: number;
    previousRows: number;
  }>;
  merchants: Array<{
    id: string | null;
    name: string;
    currentExpenseCents: number;
    previousExpenseCents: number;
    currentRows: number;
    previousRows: number;
    currentAverageCents: number | null;
    habitualAverageCents: number | null;
    historyRows: number | null;
  }>;
  dailySpend?: AnalysisDailySpend[];
  weekdaySpend?: AnalysisWeekdaySpend[];
  amountBands?: AnalysisAmountBand[];
  concepts?: AnalysisConceptSummary[];
  accountSpend?: AnalysisAccountSpend[];
  topTransactions?: AnalysisTopTransaction[];
  concentration: {
    top3CategoryBps: number | null;
    top3MerchantBps: number | null;
  };
  anomalies: Array<{
    transactionId: string;
    bankDate: string;
    amountCents: number;
    merchantId: string | null;
    merchantName: string;
    categoryId: string | null;
    categoryName: string;
    conceptNormalized: string;
    habitualCents: number;
    historyRows: number;
    variationBps: number | null;
  }>;
  fixedVariable: {
    available: boolean;
    reliableRecurrences: number;
    fixedExpenseCents: number;
    variableExpenseCents: number;
  };
  budget: null | {
    month: string;
    total: null | {
      automaticAmountCents?: number;
      manualAmountCents?: number | null;
      effectiveAmountCents: number;
      actualExpenseCents: number;
      remainingCents: number;
      progressBps: number | null;
      status: string;
    };
    overCategories: Array<{
      categoryId: string | null;
      categoryName: string | null;
      effectiveAmountCents: number;
      actualExpenseCents: number;
      remainingCents: number;
      progressBps: number | null;
      status: string;
    }>;
    categoryDetailDeferred?: boolean;
  };
  forecast: null | {
    period: { dateFrom: string; dateTo: string; accountId: string | null };
    summary: {
      plannedItems: number;
      projectedNetCents: number;
      projectedIncomeCents: number;
      projectedExpenseCents: number;
      projectedClosingBalanceCents: number | null;
      openingBalanceCents: number | null;
    };
    detailDeferred?: boolean;
  };
};

export type AnalysisSnapshot = {
  contractVersion: 2;
  selection: {
    range: AnalysisRange;
    month: string;
    accountId: string | null;
    dateFrom: string;
    dateTo: string;
    previousDateFrom: string;
    previousDateTo: string;
    partial: boolean;
    partialMonthStart: string | null;
  };
  current: AnalysisPeriod;
  previous: AnalysisPeriod;
  comparison: {
    incomeDeltaCents: number;
    incomeChangeBps: number | null;
    expenseDeltaCents: number;
    expenseChangeBps: number | null;
    netDeltaCents: number;
    netChangeBps: number | null;
    savingsDeltaCents: number;
    savingsChangeBps: number | null;
    savingsRateDeltaBps: number | null;
  };
  averages: {
    last3Months: AnalysisPeriodAverage | null;
    last6Months: AnalysisPeriodAverage | null;
  };
  history: AnalysisMonthlyRow[];
  dailySpend: AnalysisDailySpend[];
  weekdaySpend: AnalysisWeekdaySpend[];
  amountBands: AnalysisAmountBand[];
  concepts: AnalysisConceptSummary[];
  accountSpend: AnalysisAccountSpend[];
  topTransactions: AnalysisTopTransaction[];
  trends: {
    income: AnalysisTrend;
    expense: AnalysisTrend;
    savings: AnalysisTrend;
    net: AnalysisTrend;
    savingsRate: AnalysisTrend;
  };
  categoryDrivers: AnalysisDriver[];
  merchantDrivers: AnalysisMerchantDriver[];
  changeDrivers: AnalysisDriver[];
  concentration: AnalysisGatewaySnapshot["concentration"];
  anomalies: Array<AnalysisGatewaySnapshot["anomalies"][number] & { href: string }>;
  fixedVariable: AnalysisGatewaySnapshot["fixedVariable"] & { fixedShareBps: number | null };
  budget: AnalysisGatewaySnapshot["budget"];
  forecast: AnalysisGatewaySnapshot["forecast"];
  accounts: AnalysisAccount[];
  quality: {
    reconciled: boolean;
    categoryExpenseCents: number;
    expenseRows: number;
    excludedRows: number;
    confirmedDuplicateRows: number;
  };
  principles: {
    bankSource: "read_only";
    totals: "financial_period";
    history: "financial_monthly_series";
    drivers: "financial_transaction_facts_aggregate";
    anomalies: "deterministic_history_threshold";
    generativeAi: false;
  };
};

export type AnalysisPeriodAverage = {
  months: number;
  incomeCents: number;
  expenseCents: number;
  operatingNetCents: number;
  savingsCents: number;
  savingsRateBps: number | null;
};

function changeBps(current: number, previous: number) {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 10000) / Math.abs(previous));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function periodAverage(rows: AnalysisMonthlyRow[], months: number): AnalysisPeriodAverage | null {
  const sample = rows.slice(-months);
  if (sample.length < months) return null;
  const rates = sample.map((row) => row.savingsRateBps).filter((value): value is number => value !== null);
  return {
    months,
    incomeCents: average(sample.map((row) => row.incomeCents)) ?? 0,
    expenseCents: average(sample.map((row) => row.expenseCents)) ?? 0,
    operatingNetCents: average(sample.map((row) => row.operatingNetCents)) ?? 0,
    savingsCents: average(sample.map((row) => row.savingsCents)) ?? 0,
    savingsRateBps: rates.length === months ? average(rates) : null,
  };
}

function trend(rows: AnalysisMonthlyRow[], selector: (row: AnalysisMonthlyRow) => number | null): AnalysisTrend {
  const sampleRows = rows.slice(-6);
  const selected = sampleRows.map(selector);
  const validValues = selected.filter((value): value is number => value !== null);
  if (sampleRows.length < 6 || validValues.length < 6) {
    return {
      direction: "insufficient",
      delta: null,
      recentAverage: null,
      previousAverage: null,
      sampleMonths: validValues.length,
    };
  }

  const values = selected as number[];
  const previousAverage = average(values.slice(0, 3));
  const recentAverage = average(values.slice(3));
  if (previousAverage === null || recentAverage === null) {
    return { direction: "insufficient", delta: null, recentAverage: null, previousAverage: null, sampleMonths: values.length };
  }
  const delta = recentAverage - previousAverage;
  return {
    direction: delta === 0 ? "stable" : delta > 0 ? "up" : "down",
    delta,
    recentAverage,
    previousAverage,
    sampleMonths: values.length,
  };
}

function drilldownHref(input: {
  dateFrom: string;
  dateTo: string;
  accountId: string | null;
  kind: "category" | "merchant";
  id: string | null;
}) {
  if (input.kind === "merchant" && input.id === null) return null;
  const params = new URLSearchParams({ dateFrom: input.dateFrom, dateTo: input.dateTo, kind: "expense" });
  if (input.accountId) params.set("accountId", input.accountId);
  if (input.kind === "category") {
    if (input.id === null) params.set("uncategorized", "true");
    else params.set("categoryId", input.id);
  }
  if (input.kind === "merchant" && input.id) params.set("merchantId", input.id);
  return `/transactions?${params.toString()}`;
}

function anomalyHref(
  anomaly: AnalysisGatewaySnapshot["anomalies"][number],
  accountId: string | null,
) {
  const params = new URLSearchParams({
    dateFrom: anomaly.bankDate,
    dateTo: anomaly.bankDate,
    kind: "expense",
  });
  if (accountId) params.set("accountId", accountId);
  if (anomaly.merchantId) params.set("merchantId", anomaly.merchantId);
  else if (anomaly.categoryId) params.set("categoryId", anomaly.categoryId);
  return `/transactions?${params.toString()}`;
}

export function buildAnalysisSnapshot(input: {
  range: AnalysisRange;
  month: string;
  accountId: string | null;
  dateFrom: string;
  dateTo: string;
  previousDateFrom: string;
  previousDateTo: string;
  partial: boolean;
  partialMonthStart: string | null;
  gateway: AnalysisGatewaySnapshot;
}): AnalysisSnapshot {
  const history = (input.gateway.history?.rows ?? []).map<AnalysisMonthlyRow>((row) => ({
    ...row,
    savingsRateBps: row.savingsRateBps ?? (row.incomeCents > 0
      ? Math.round((row.savingsCents * 10000) / row.incomeCents)
      : null),
  }));
  const completeHistory = input.partialMonthStart
    ? history.filter((row) => row.monthStart !== input.partialMonthStart)
    : history;

  const categoryDrivers = (input.gateway.categories ?? [])
    .map<AnalysisDriver>((row) => ({
      id: row.id,
      name: row.name,
      expenseCents: row.currentExpenseCents,
      previousExpenseCents: row.previousExpenseCents,
      deltaCents: row.currentExpenseCents - row.previousExpenseCents,
      changeBps: changeBps(row.currentExpenseCents, row.previousExpenseCents),
      shareBps: input.gateway.current.expenseCents > 0
        ? Math.round((row.currentExpenseCents * 10000) / input.gateway.current.expenseCents)
        : null,
      rows: row.currentRows,
      previousRows: row.previousRows,
      href: drilldownHref({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        accountId: input.accountId,
        kind: "category",
        id: row.id,
      }),
    }))
    .sort((a, b) => b.expenseCents - a.expenseCents || Math.abs(b.deltaCents) - Math.abs(a.deltaCents));

  const merchantDrivers = (input.gateway.merchants ?? [])
    .map<AnalysisMerchantDriver>((row) => ({
      id: row.id,
      name: row.name,
      expenseCents: row.currentExpenseCents,
      previousExpenseCents: row.previousExpenseCents,
      deltaCents: row.currentExpenseCents - row.previousExpenseCents,
      changeBps: changeBps(row.currentExpenseCents, row.previousExpenseCents),
      shareBps: input.gateway.current.expenseCents > 0
        ? Math.round((row.currentExpenseCents * 10000) / input.gateway.current.expenseCents)
        : null,
      rows: row.currentRows,
      previousRows: row.previousRows,
      href: drilldownHref({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        accountId: input.accountId,
        kind: "merchant",
        id: row.id,
      }),
      averageCents: row.currentAverageCents,
      habitualAverageCents: row.habitualAverageCents,
      habitualRows: row.historyRows ?? 0,
      habitualVariationBps: row.currentAverageCents !== null && row.habitualAverageCents !== null && (row.historyRows ?? 0) >= 4
        ? changeBps(row.currentAverageCents, row.habitualAverageCents)
        : null,
    }))
    .sort((a, b) => b.expenseCents - a.expenseCents || Math.abs(b.deltaCents) - Math.abs(a.deltaCents));

  const categoryExpenseCents = categoryDrivers.reduce((sum, row) => sum + row.expenseCents, 0);
  const reconciled = categoryExpenseCents === input.gateway.current.expenseCents;
  if (!reconciled) throw new Error("analysis_reconciliation_failed");

  const fixedVariable = input.gateway.fixedVariable ?? {
    available: false,
    reliableRecurrences: 0,
    fixedExpenseCents: 0,
    variableExpenseCents: input.gateway.current.expenseCents,
  };
  const fixedVariableTotal = fixedVariable.fixedExpenseCents + fixedVariable.variableExpenseCents;

  return {
    contractVersion: 2,
    selection: {
      range: input.range,
      month: input.month,
      accountId: input.accountId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      previousDateFrom: input.previousDateFrom,
      previousDateTo: input.previousDateTo,
      partial: input.partial,
      partialMonthStart: input.partialMonthStart,
    },
    current: input.gateway.current,
    previous: input.gateway.previous,
    comparison: {
      incomeDeltaCents: input.gateway.current.incomeCents - input.gateway.previous.incomeCents,
      incomeChangeBps: changeBps(input.gateway.current.incomeCents, input.gateway.previous.incomeCents),
      expenseDeltaCents: input.gateway.current.expenseCents - input.gateway.previous.expenseCents,
      expenseChangeBps: changeBps(input.gateway.current.expenseCents, input.gateway.previous.expenseCents),
      netDeltaCents: input.gateway.current.operatingNetCents - input.gateway.previous.operatingNetCents,
      netChangeBps: changeBps(input.gateway.current.operatingNetCents, input.gateway.previous.operatingNetCents),
      savingsDeltaCents: input.gateway.current.savingsCents - input.gateway.previous.savingsCents,
      savingsChangeBps: changeBps(input.gateway.current.savingsCents, input.gateway.previous.savingsCents),
      savingsRateDeltaBps: input.gateway.current.savingsRateBps !== null && input.gateway.previous.savingsRateBps !== null
        ? input.gateway.current.savingsRateBps - input.gateway.previous.savingsRateBps
        : null,
    },
    averages: {
      last3Months: periodAverage(completeHistory, 3),
      last6Months: periodAverage(completeHistory, 6),
    },
    history,
    dailySpend: input.gateway.dailySpend ?? [],
    weekdaySpend: input.gateway.weekdaySpend ?? [],
    amountBands: input.gateway.amountBands ?? [],
    concepts: input.gateway.concepts ?? [],
    accountSpend: input.gateway.accountSpend ?? [],
    topTransactions: input.gateway.topTransactions ?? [],
    trends: {
      income: trend(completeHistory, (row) => row.incomeCents),
      expense: trend(completeHistory, (row) => row.expenseCents),
      savings: trend(completeHistory, (row) => row.savingsCents),
      net: trend(completeHistory, (row) => row.operatingNetCents),
      savingsRate: trend(completeHistory, (row) => row.savingsRateBps),
    },
    categoryDrivers,
    merchantDrivers,
    changeDrivers: [...categoryDrivers]
      .filter((row) => row.deltaCents !== 0)
      .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents)),
    concentration: input.gateway.concentration,
    anomalies: (input.gateway.anomalies ?? []).map((row) => ({
      ...row,
      href: anomalyHref(row, input.accountId),
    })),
    fixedVariable: {
      ...fixedVariable,
      fixedShareBps: fixedVariable.available && fixedVariableTotal > 0
        ? Math.round((fixedVariable.fixedExpenseCents * 10000) / fixedVariableTotal)
        : null,
    },
    budget: input.gateway.budget,
    forecast: input.gateway.forecast,
    accounts: input.gateway.accounts ?? [],
    quality: {
      reconciled,
      categoryExpenseCents,
      expenseRows: input.gateway.current.quality?.includedRows ?? categoryDrivers.reduce((sum, row) => sum + row.rows, 0),
      excludedRows: input.gateway.current.quality?.manuallyExcludedRows ?? 0,
      confirmedDuplicateRows: input.gateway.current.quality?.confirmedDuplicateRows ?? 0,
    },
    principles: {
      bankSource: "read_only",
      totals: "financial_period",
      history: "financial_monthly_series",
      drivers: "financial_transaction_facts_aggregate",
      anomalies: "deterministic_history_threshold",
      generativeAi: false,
    },
  };
}
