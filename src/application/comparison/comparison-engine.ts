import type {
  AnalysisAccount,
  AnalysisGatewaySnapshot,
  AnalysisPeriod,
} from "../analysis/analysis-engine";
import type { ResolvedComparisonSelection } from "./comparison-selection";

export type ComparisonMoneyMetric = {
  primaryCents: number;
  referenceCents: number;
  deltaCents: number;
  changeBps: number | null;
  primaryDailyCents: number;
  referenceDailyCents: number;
  dailyDeltaCents: number;
};

export type ComparisonDriver = {
  id: string | null;
  name: string;
  primaryExpenseCents: number;
  referenceExpenseCents: number;
  deltaCents: number;
  changeBps: number | null;
  primaryShareBps: number | null;
  referenceShareBps: number | null;
  primaryRows: number;
  referenceRows: number;
  primaryHref: string | null;
  referenceHref: string | null;
};

export type ComparisonSnapshot = {
  contractVersion: 1;
  selection: ResolvedComparisonSelection;
  primary: AnalysisPeriod;
  reference: AnalysisPeriod;
  metrics: {
    income: ComparisonMoneyMetric;
    expense: ComparisonMoneyMetric;
    operatingNet: ComparisonMoneyMetric;
    savings: ComparisonMoneyMetric;
  };
  savingsRate: {
    primaryBps: number | null;
    referenceBps: number | null;
    deltaBps: number | null;
  };
  categoryDrivers: ComparisonDriver[];
  merchantDrivers: ComparisonDriver[];
  accounts: AnalysisAccount[];
  links: {
    primaryTransactions: string;
    referenceTransactions: string;
  };
  quality: {
    reconciled: true;
    primaryCategoryExpenseCents: number;
    referenceCategoryExpenseCents: number;
    primaryIncludedRows: number;
    referenceIncludedRows: number;
    primaryExcludedRows: number;
    referenceExcludedRows: number;
  };
  principles: {
    bankSource: "read_only";
    totals: "financial_period";
    comparison: "deterministic_periods";
    drivers: "financial_transaction_facts_aggregate";
    generativeAi: false;
  };
};

function safeInteger(value: number, code = "comparison_money_invalid") {
  if (!Number.isSafeInteger(value)) throw new Error(code);
  return value;
}

function nonNegativeInteger(value: number, code = "comparison_rows_invalid") {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}

function safeSubtract(left: number, right: number) {
  return safeInteger(left - right, "comparison_money_overflow");
}

function safeSum(values: number[]) {
  return values.reduce((sum, value) => safeInteger(sum + value, "comparison_money_overflow"), 0);
}

function changeBps(primary: number, reference: number) {
  if (reference === 0) return null;
  const result = Math.round((safeSubtract(primary, reference) / Math.abs(reference)) * 10_000);
  return safeInteger(result, "comparison_ratio_overflow");
}

function shareBps(value: number, total: number) {
  if (total === 0) return null;
  const result = Math.round((value / total) * 10_000);
  return safeInteger(result, "comparison_ratio_overflow");
}

function metric(primary: number, reference: number, primaryDays: number, referenceDays: number): ComparisonMoneyMetric {
  safeInteger(primary);
  safeInteger(reference);
  const primaryDailyCents = safeInteger(Math.round(primary / primaryDays));
  const referenceDailyCents = safeInteger(Math.round(reference / referenceDays));
  return {
    primaryCents: primary,
    referenceCents: reference,
    deltaCents: safeSubtract(primary, reference),
    changeBps: changeBps(primary, reference),
    primaryDailyCents,
    referenceDailyCents,
    dailyDeltaCents: safeSubtract(primaryDailyCents, referenceDailyCents),
  };
}

function periodHref(input: {
  dateFrom: string;
  dateTo: string;
  accountId: string | null;
  kind?: "income" | "expense";
  categoryId?: string | null;
  merchantId?: string | null;
}) {
  const params = new URLSearchParams({ dateFrom: input.dateFrom, dateTo: input.dateTo });
  if (input.accountId) params.set("accountId", input.accountId);
  if (input.kind) params.set("kind", input.kind);
  if (input.categoryId === null) params.set("uncategorized", "true");
  else if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.merchantId) params.set("merchantId", input.merchantId);
  return `/transactions?${params.toString()}`;
}

function driverHref(input: {
  kind: "category" | "merchant";
  id: string | null;
  dateFrom: string;
  dateTo: string;
  accountId: string | null;
}) {
  if (input.kind === "merchant" && input.id === null) return null;
  return periodHref({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    accountId: input.accountId,
    kind: "expense",
    categoryId: input.kind === "category" ? input.id : undefined,
    merchantId: input.kind === "merchant" ? input.id : undefined,
  });
}

function drivers(input: {
  kind: "category" | "merchant";
  rows: Array<{
    id: string | null;
    name: string;
    currentExpenseCents: number;
    previousExpenseCents: number;
    currentRows: number;
    previousRows: number;
  }>;
  selection: ResolvedComparisonSelection;
  primaryExpenseCents: number;
  referenceExpenseCents: number;
}) {
  return input.rows
    .map<ComparisonDriver>((row) => {
      nonNegativeInteger(row.currentExpenseCents, "comparison_expense_invalid");
      nonNegativeInteger(row.previousExpenseCents, "comparison_expense_invalid");
      nonNegativeInteger(row.currentRows);
      nonNegativeInteger(row.previousRows);
      if (typeof row.name !== "string" || !row.name.trim()) throw new Error("comparison_driver_invalid");
      return {
        id: row.id,
        name: row.name,
        primaryExpenseCents: row.currentExpenseCents,
        referenceExpenseCents: row.previousExpenseCents,
        deltaCents: safeSubtract(row.currentExpenseCents, row.previousExpenseCents),
        changeBps: changeBps(row.currentExpenseCents, row.previousExpenseCents),
        primaryShareBps: shareBps(row.currentExpenseCents, input.primaryExpenseCents),
        referenceShareBps: shareBps(row.previousExpenseCents, input.referenceExpenseCents),
        primaryRows: row.currentRows,
        referenceRows: row.previousRows,
        primaryHref: driverHref({
          kind: input.kind,
          id: row.id,
          dateFrom: input.selection.primaryFrom,
          dateTo: input.selection.primaryTo,
          accountId: input.selection.accountId,
        }),
        referenceHref: driverHref({
          kind: input.kind,
          id: row.id,
          dateFrom: input.selection.referenceFrom,
          dateTo: input.selection.referenceTo,
          accountId: input.selection.accountId,
        }),
      };
    })
    .sort((left, right) => (
      Math.abs(right.deltaCents) - Math.abs(left.deltaCents)
      || right.primaryExpenseCents - left.primaryExpenseCents
      || left.name.localeCompare(right.name, "es")
    ));
}

function assertPeriod(period: AnalysisPeriod, expectedFrom: string, expectedTo: string) {
  if (period.dateFrom !== expectedFrom || period.dateTo !== expectedTo) {
    throw new Error("comparison_gateway_period_mismatch");
  }
  nonNegativeInteger(period.incomeCents, "comparison_income_invalid");
  nonNegativeInteger(period.expenseCents, "comparison_expense_invalid");
  safeInteger(period.operatingNetCents);
  safeInteger(period.savingsCents);
  if (period.savingsRateBps !== null) safeInteger(period.savingsRateBps, "comparison_ratio_invalid");
}

export function buildComparisonSnapshot(input: {
  selection: ResolvedComparisonSelection;
  gateway: AnalysisGatewaySnapshot;
}): ComparisonSnapshot {
  const { gateway, selection } = input;
  assertPeriod(gateway.current, selection.primaryFrom, selection.primaryTo);
  assertPeriod(gateway.previous, selection.referenceFrom, selection.referenceTo);

  const categoryDrivers = drivers({
    kind: "category",
    rows: gateway.categories ?? [],
    selection,
    primaryExpenseCents: gateway.current.expenseCents,
    referenceExpenseCents: gateway.previous.expenseCents,
  });
  const merchantDrivers = drivers({
    kind: "merchant",
    rows: gateway.merchants ?? [],
    selection,
    primaryExpenseCents: gateway.current.expenseCents,
    referenceExpenseCents: gateway.previous.expenseCents,
  });

  const primaryCategoryExpenseCents = safeSum(categoryDrivers.map((row) => row.primaryExpenseCents));
  const referenceCategoryExpenseCents = safeSum(categoryDrivers.map((row) => row.referenceExpenseCents));
  if (
    primaryCategoryExpenseCents !== gateway.current.expenseCents
    || referenceCategoryExpenseCents !== gateway.previous.expenseCents
  ) {
    throw new Error("comparison_reconciliation_failed");
  }

  const savingsRateDelta = gateway.current.savingsRateBps !== null && gateway.previous.savingsRateBps !== null
    ? safeSubtract(gateway.current.savingsRateBps, gateway.previous.savingsRateBps)
    : null;

  return {
    contractVersion: 1,
    selection,
    primary: gateway.current,
    reference: gateway.previous,
    metrics: {
      income: metric(gateway.current.incomeCents, gateway.previous.incomeCents, selection.primaryDays, selection.referenceDays),
      expense: metric(gateway.current.expenseCents, gateway.previous.expenseCents, selection.primaryDays, selection.referenceDays),
      operatingNet: metric(gateway.current.operatingNetCents, gateway.previous.operatingNetCents, selection.primaryDays, selection.referenceDays),
      savings: metric(gateway.current.savingsCents, gateway.previous.savingsCents, selection.primaryDays, selection.referenceDays),
    },
    savingsRate: {
      primaryBps: gateway.current.savingsRateBps,
      referenceBps: gateway.previous.savingsRateBps,
      deltaBps: savingsRateDelta,
    },
    categoryDrivers,
    merchantDrivers,
    accounts: gateway.accounts ?? [],
    links: {
      primaryTransactions: periodHref({
        dateFrom: selection.primaryFrom,
        dateTo: selection.primaryTo,
        accountId: selection.accountId,
      }),
      referenceTransactions: periodHref({
        dateFrom: selection.referenceFrom,
        dateTo: selection.referenceTo,
        accountId: selection.accountId,
      }),
    },
    quality: {
      reconciled: true,
      primaryCategoryExpenseCents,
      referenceCategoryExpenseCents,
      primaryIncludedRows: nonNegativeInteger(gateway.current.quality?.includedRows ?? categoryDrivers.reduce((sum, row) => sum + row.primaryRows, 0)),
      referenceIncludedRows: nonNegativeInteger(gateway.previous.quality?.includedRows ?? categoryDrivers.reduce((sum, row) => sum + row.referenceRows, 0)),
      primaryExcludedRows: nonNegativeInteger(gateway.current.quality?.manuallyExcludedRows ?? 0),
      referenceExcludedRows: nonNegativeInteger(gateway.previous.quality?.manuallyExcludedRows ?? 0),
    },
    principles: {
      bankSource: "read_only",
      totals: "financial_period",
      comparison: "deterministic_periods",
      drivers: "financial_transaction_facts_aggregate",
      generativeAi: false,
    },
  };
}
