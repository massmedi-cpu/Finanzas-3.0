export type BudgetStatus = "empty" | "unfunded" | "on_track" | "over";

export type BudgetHistoryMonth = {
  month: string;
  expenseCents: number;
};

export type BudgetAutomaticFactors = {
  algorithm: "axioma_52_budget_reference_v1";
  mode: "fallback_3_month_average" | "axioma_52_weighted";
  availableMonthCount: number;
  trailing3AverageCents: number;
  recentWeightedCents: number;
  seasonalSameMonthCents: number;
  seasonalMonthCount: number;
  trendAdjustmentCents: number;
  knownRecurringCents: number;
  extraordinaryMonthCount: number;
  extraordinaryCapCents: number | null;
  recurrencePolicy: "floor_not_additive";
  exclusionsSource: "financial_transaction_allocation_facts.analytics_eligible";
};

export type BudgetItem = {
  id: string | null;
  persisted: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryLifecycle: "active" | "archived" | null;
  automaticAmountCents: number;
  manualAmountCents: number | null;
  effectiveAmountCents: number;
  actualExpenseCents: number;
  remainingCents: number;
  progressBps: number | null;
  status: BudgetStatus;
  automaticExplanation: string;
  automaticFactors?: BudgetAutomaticFactors | null;
  historyMonths: BudgetHistoryMonth[];
};

export type BudgetPlanningState = "ready" | "unavailable" | "mismatch";
export type BudgetObjectiveState =
  | "ready"
  | "needs_limit"
  | "no_income"
  | "unavailable"
  | "mismatch";

export type BudgetPlanningContext = {
  contractVersion: 1;
  state: BudgetPlanningState;
  objectiveState: BudgetObjectiveState;
  historyDateFrom: string;
  historyDateTo: string;
  historicalBaselineCents: number;
  selectedLimitCents: number | null;
  trackingReferenceCents: number;
  differenceFromBaselineCents: number | null;
  averageIncomeCents: number | null;
  targetSavingsCents: number | null;
  targetSavingsRateBps: number | null;
  incomeHistoryMonths: Array<{
    month: string;
    incomeCents: number;
  }>;
  principles: {
    historicalBaseline: "axioma_52_budget_reference";
    chosenLimit: "manual_total_budget_only";
    objective: "average_income_minus_chosen_limit";
    incomeSource: "financial_monthly_series";
    financialAdvice: false;
  };
};

export type BudgetSnapshot = {
  contractVersion: 1;
  month: string;
  monthStart: string;
  monthEnd: string;
  total: BudgetItem;
  categories: BudgetItem[];
  principles: {
    bankSource: "read_only";
    actualSource: "financial_transaction_allocation_facts";
    recommendation: "axioma_52_weighted_history_seasonality_trend_recurrence_floor";
    transfersConsumeBudget: boolean;
    confirmedDuplicatesConsumeBudget: boolean;
    manualAnalyticsExclusionsRespected: boolean;
    refundsNetAgainstExpense: boolean;
    manualOverrideWins: boolean;
    parentCategoryIncludesDescendants: boolean;
  };
  planning?: BudgetPlanningContext;
};

type FinancialMonthlyRow = {
  monthStart: string;
  rows: number;
  incomeCents: number;
  expenseCents: number;
  operatingNetCents: number;
  savingsCents: number;
  savingsRateBps?: number | null;
};

type FinancialMonthlySeries = {
  dateFrom: string;
  dateTo: string;
  accountId: null;
  rows: FinancialMonthlyRow[];
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const absoluteMonth = (year - 1) * 12 + (number - 1) + offset;
  if (absoluteMonth < 0) throw new Error("invalid_budget_month");
  const shiftedYear = Math.floor(absoluteMonth / 12) + 1;
  const shiftedMonth = (absoluteMonth % 12) + 1;
  return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth).padStart(2, "0")}`;
}

function monthEnd(month: string) {
  const [year, number] = month.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const day = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][number - 1];
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function budgetPlanningRange(month: string) {
  if (!MONTH.test(month)) throw new Error("invalid_budget_month");
  const months = [-3, -2, -1].map((offset) => shiftMonth(month, offset));
  return {
    months,
    dateFrom: `${months[0]}-01`,
    dateTo: monthEnd(months[2]),
  };
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function safeAverage(values: number[]) {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  const average = Math.round(total / values.length);
  return Number.isSafeInteger(average) ? average : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isAutomaticFactors(value: unknown): value is BudgetAutomaticFactors {
  if (!value || typeof value !== "object") return false;
  const factors = value as Partial<BudgetAutomaticFactors>;
  return factors.algorithm === "axioma_52_budget_reference_v1"
    && (factors.mode === "fallback_3_month_average" || factors.mode === "axioma_52_weighted")
    && isSafeInteger(factors.availableMonthCount) && factors.availableMonthCount >= 0
    && isSafeInteger(factors.trailing3AverageCents) && factors.trailing3AverageCents >= 0
    && isSafeInteger(factors.recentWeightedCents) && factors.recentWeightedCents >= 0
    && isSafeInteger(factors.seasonalSameMonthCents) && factors.seasonalSameMonthCents >= 0
    && isSafeInteger(factors.seasonalMonthCount) && factors.seasonalMonthCount >= 0
    && isSafeInteger(factors.trendAdjustmentCents)
    && isSafeInteger(factors.knownRecurringCents) && factors.knownRecurringCents >= 0
    && isSafeInteger(factors.extraordinaryMonthCount) && factors.extraordinaryMonthCount >= 0
    && (factors.extraordinaryCapCents === null
      || (isSafeInteger(factors.extraordinaryCapCents) && factors.extraordinaryCapCents >= 0))
    && factors.recurrencePolicy === "floor_not_additive"
    && factors.exclusionsSource === "financial_transaction_allocation_facts.analytics_eligible";
}

function isBudgetItem(value: unknown): value is BudgetItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BudgetItem>;
  const historyMonths = item.historyMonths;
  return isNullableString(item.id)
    && typeof item.persisted === "boolean"
    && isNullableString(item.categoryId)
    && isNullableString(item.categoryName)
    && (item.categoryLifecycle === null || item.categoryLifecycle === "active" || item.categoryLifecycle === "archived")
    && isSafeInteger(item.automaticAmountCents) && item.automaticAmountCents >= 0
    && (item.manualAmountCents === null || (isSafeInteger(item.manualAmountCents) && item.manualAmountCents >= 0))
    && isSafeInteger(item.effectiveAmountCents) && item.effectiveAmountCents >= 0
    && isSafeInteger(item.actualExpenseCents) && item.actualExpenseCents >= 0
    && isSafeInteger(item.remainingCents)
    // Validate relationships as well as primitive types. An API payload
    // whose amounts disagree must not render a plausible but false margin.
    && item.effectiveAmountCents === (item.manualAmountCents ?? item.automaticAmountCents)
    && Number.isSafeInteger(item.effectiveAmountCents - item.actualExpenseCents)
    && item.remainingCents === item.effectiveAmountCents - item.actualExpenseCents
    && (item.status !== "over" || item.remainingCents < 0)
    && (item.status !== "on_track" || item.remainingCents >= 0)
    && (item.progressBps === null || isSafeInteger(item.progressBps))
    && ["empty", "unfunded", "on_track", "over"].includes(item.status ?? "")
    && typeof item.automaticExplanation === "string"
    && (item.automaticFactors === undefined || item.automaticFactors === null || isAutomaticFactors(item.automaticFactors))
    && Array.isArray(historyMonths)
    && historyMonths.every((row) =>
      Boolean(row) && typeof row === "object"
      && typeof row.month === "string" && MONTH.test(row.month)
      && isSafeInteger(row.expenseCents) && row.expenseCents >= 0,
    )
    // Duplicate history months break React keys and visually double-count
    // periods in comparisons; their order must also be chronological.
    && historyMonths.every((row, index) =>
      index === 0 || historyMonths[index - 1].month < row.month
    );
}

function isBudgetPlanningContext(value: unknown, snapshot: BudgetSnapshot): value is BudgetPlanningContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const planning = value as Partial<BudgetPlanningContext>;
  const range = budgetPlanningRange(snapshot.month);
  const selected = snapshot.total.manualAmountCents;
  const difference = selected === null ? null : selected - snapshot.total.automaticAmountCents;
  const savings = planning.averageIncomeCents !== null
    && planning.averageIncomeCents !== undefined
    && selected !== null
    && planning.averageIncomeCents > 0
    ? planning.averageIncomeCents - selected : null;
  const incomeMonths = planning.incomeHistoryMonths;
  return planning.contractVersion === 1
    && ["ready", "unavailable", "mismatch"].includes(planning.state ?? "")
    && ["ready", "needs_limit", "no_income", "unavailable", "mismatch"].includes(planning.objectiveState ?? "")
    && planning.historyDateFrom === range.dateFrom
    && planning.historyDateTo === range.dateTo
    && planning.historicalBaselineCents === snapshot.total.automaticAmountCents
    && planning.selectedLimitCents === selected
    && planning.trackingReferenceCents === snapshot.total.effectiveAmountCents
    && planning.differenceFromBaselineCents === difference
    && (planning.averageIncomeCents === null ||
      (isSafeInteger(planning.averageIncomeCents) && planning.averageIncomeCents >= 0))
    && (planning.targetSavingsCents === null || isSafeInteger(planning.targetSavingsCents))
    && (planning.targetSavingsRateBps === null || isSafeInteger(planning.targetSavingsRateBps))
    && (planning.objectiveState !== "ready" ||
      (planning.state === "ready"
        && savings !== null
        && Number.isSafeInteger(savings)
        && planning.targetSavingsCents === savings
        && planning.targetSavingsRateBps === Math.round((savings / planning.averageIncomeCents!) * 10_000)))
    && Array.isArray(incomeMonths)
    && incomeMonths.every((row, index) =>
      Boolean(row)
      && typeof row.month === "string"
      && row.month === range.months[index]
      && isSafeInteger(row.incomeCents) && row.incomeCents >= 0
    )
    && incomeMonths.length <= range.months.length
    // A "ready" savings forecast requires every monthly income input, and
    // its displayed mean must be derivable from those actual source rows.
    && (planning.state !== "ready" || (
      incomeMonths.length === range.months.length
      && planning.averageIncomeCents === safeAverage(incomeMonths.map((row) => row.incomeCents))
    ))
    && (planning.objectiveState === "ready" || (
      planning.targetSavingsCents === null
      && planning.targetSavingsRateBps === null
    ))
    && planning.principles?.historicalBaseline === "axioma_52_budget_reference"
    && planning.principles?.chosenLimit === "manual_total_budget_only"
    && planning.principles?.objective === "average_income_minus_chosen_limit"
    && planning.principles?.incomeSource === "financial_monthly_series"
    && planning.principles?.financialAdvice === false;
}

export function isBudgetSnapshot(value: unknown): value is BudgetSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<BudgetSnapshot>;
  const principles = snapshot.principles;
  if (!principles) return false;
  return snapshot.contractVersion === 1
    && typeof snapshot.month === "string" && MONTH.test(snapshot.month)
    && snapshot.monthStart === `${snapshot.month}-01`
    && snapshot.monthEnd === monthEnd(snapshot.month)
    && isBudgetItem(snapshot.total)
    && snapshot.total.categoryId === null
    && Array.isArray(snapshot.categories) && snapshot.categories.every(isBudgetItem)
    // A category can appear only once within a budget snapshot. Otherwise
    // the same spending is presented twice and React may reuse stale cards.
    && snapshot.categories.every((item) => typeof item.categoryId === "string" && item.categoryId.length > 0)
    && new Set(snapshot.categories.map((item) => item.categoryId)).size === snapshot.categories.length
    && (snapshot.planning === undefined || isBudgetPlanningContext(snapshot.planning, snapshot as BudgetSnapshot))
    && principles.bankSource === "read_only"
    && principles.actualSource === "financial_transaction_allocation_facts"
    && principles.recommendation === "axioma_52_weighted_history_seasonality_trend_recurrence_floor"
    && typeof principles.transfersConsumeBudget === "boolean"
    && typeof principles.confirmedDuplicatesConsumeBudget === "boolean"
    && typeof principles.manualAnalyticsExclusionsRespected === "boolean"
    && typeof principles.refundsNetAgainstExpense === "boolean"
    && typeof principles.manualOverrideWins === "boolean"
    && typeof principles.parentCategoryIncludesDescendants === "boolean";
}

function readMonthlySeries(
  value: unknown,
  range: ReturnType<typeof budgetPlanningRange>,
): FinancialMonthlySeries | null {
  if (!value || typeof value !== "object") return null;
  const series = value as Partial<FinancialMonthlySeries>;
  if (
    series.dateFrom !== range.dateFrom
    || series.dateTo !== range.dateTo
    || series.accountId !== null
    || !Array.isArray(series.rows)
    || series.rows.length !== range.months.length
  ) {
    return null;
  }

  const rows = series.rows as Array<Partial<FinancialMonthlyRow>>;
  const valid = rows.every((row, index) =>
    row.monthStart === `${range.months[index]}-01`
    && isSafeInteger(row.rows) && row.rows >= 0
    && isSafeInteger(row.incomeCents) && row.incomeCents >= 0
    && isSafeInteger(row.expenseCents) && row.expenseCents >= 0
    && isSafeInteger(row.operatingNetCents)
    && isSafeInteger(row.savingsCents)
    && (
      row.savingsRateBps === undefined
      || row.savingsRateBps === null
      || isSafeInteger(row.savingsRateBps)
    ),
  );

  return valid ? (series as FinancialMonthlySeries) : null;
}

function basePlanning(snapshot: BudgetSnapshot): BudgetPlanningContext {
  const range = budgetPlanningRange(snapshot.month);
  const selectedLimitCents = snapshot.total.manualAmountCents;
  return {
    contractVersion: 1,
    state: "unavailable",
    objectiveState: "unavailable",
    historyDateFrom: range.dateFrom,
    historyDateTo: range.dateTo,
    historicalBaselineCents: snapshot.total.automaticAmountCents,
    selectedLimitCents,
    trackingReferenceCents: snapshot.total.effectiveAmountCents,
    differenceFromBaselineCents: selectedLimitCents === null
      ? null
      : selectedLimitCents - snapshot.total.automaticAmountCents,
    averageIncomeCents: null,
    targetSavingsCents: null,
    targetSavingsRateBps: null,
    incomeHistoryMonths: [],
    principles: {
      historicalBaseline: "axioma_52_budget_reference",
      chosenLimit: "manual_total_budget_only",
      objective: "average_income_minus_chosen_limit",
      incomeSource: "financial_monthly_series",
      financialAdvice: false,
    },
  };
}

/**
 * Adds decision context without changing the canonical budget engine. The
 * automatic expense reference is produced by Axioma §52; only a user-entered
 * total limit is treated as a goal. Income remains the three-month monthly
 * series used exclusively to estimate the consequence of the chosen limit.
 */
export function assembleBudgetPlanning(
  snapshot: BudgetSnapshot,
  monthlyValue: unknown,
): BudgetSnapshot & { planning: BudgetPlanningContext } {
  const planning = basePlanning(snapshot);
  if (monthlyValue === null || monthlyValue === undefined) {
    return { ...snapshot, planning };
  }

  const range = budgetPlanningRange(snapshot.month);
  const monthly = readMonthlySeries(monthlyValue, range);
  const expenseHistoryMatches = monthly !== null
    && snapshot.total.historyMonths.length === range.months.length
    && snapshot.total.historyMonths.every((row, index) =>
      row.month === range.months[index]
      && row.expenseCents === monthly.rows[index]?.expenseCents,
    )
    && snapshot.total.effectiveAmountCents
      === (snapshot.total.manualAmountCents ?? snapshot.total.automaticAmountCents);

  if (!monthly || !expenseHistoryMatches) {
    return {
      ...snapshot,
      planning: {
        ...planning,
        state: "mismatch",
        objectiveState: "mismatch",
      },
    };
  }

  const averageIncomeCents = safeAverage(monthly.rows.map((row) => row.incomeCents));
  if (averageIncomeCents === null) {
    return {
      ...snapshot,
      planning: {
        ...planning,
        state: "mismatch",
        objectiveState: "mismatch",
      },
    };
  }
  const selectedLimitCents = snapshot.total.manualAmountCents;
  const hasIncome = averageIncomeCents > 0;
  const targetSavingsCents = selectedLimitCents !== null && hasIncome
    ? averageIncomeCents - selectedLimitCents
    : null;
  const targetSavingsRateBps = targetSavingsCents !== null
    ? Math.round((targetSavingsCents / averageIncomeCents) * 10_000)
    : null;
  if (targetSavingsRateBps !== null && !Number.isSafeInteger(targetSavingsRateBps)) {
    return {
      ...snapshot,
      planning: {
        ...planning,
        state: "mismatch",
        objectiveState: "mismatch",
      },
    };
  }

  return {
    ...snapshot,
    planning: {
      ...planning,
      state: "ready",
      objectiveState: selectedLimitCents === null
        ? "needs_limit"
        : hasIncome ? "ready" : "no_income",
      averageIncomeCents,
      targetSavingsCents,
      targetSavingsRateBps,
      incomeHistoryMonths: monthly.rows.map((row) => ({
        month: row.monthStart.slice(0, 7),
        incomeCents: row.incomeCents,
      })),
    },
  };
}
