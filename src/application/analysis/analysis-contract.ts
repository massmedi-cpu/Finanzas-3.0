import type { AnalysisSnapshot } from "./analysis-engine";

const ANALYSIS_RANGES = new Set(["1m", "3m", "6m", "12m", "ytd"]);
const TREND_DIRECTIONS = new Set(["up", "down", "stable", "insufficient"]);
const AMOUNT_BANDS = new Set(["lt10", "10to25", "25to50", "50to100", "100to250", "gte250"]);
const REVIEW_STATES = new Set(["confirmed", "pending", "needs_review"]);
const DUPLICATE_STATES = new Set(["none", "suspected", "confirmed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullableFiniteNumber(value: unknown) {
  return value === null || isFiniteNumber(value);
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown) {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalNullableFiniteNumber(value: unknown) {
  return value === undefined || isNullableFiniteNumber(value);
}

function isOptionalNullableString(value: unknown) {
  return value === undefined || isNullableString(value);
}

function isOptionalBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean";
}

function everyRecord(value: unknown, predicate: (record: Record<string, unknown>) => boolean) {
  return Array.isArray(value) && value.every((item) => isRecord(item) && predicate(item));
}

function isPeriod(value: unknown) {
  if (!isRecord(value)) return false;
  return typeof value.dateFrom === "string"
    && typeof value.dateTo === "string"
    && isFiniteNumber(value.incomeCents)
    && isFiniteNumber(value.expenseCents)
    && isFiniteNumber(value.operatingNetCents)
    && isFiniteNumber(value.savingsCents)
    && isNullableFiniteNumber(value.savingsRateBps);
}

function isSelection(value: unknown) {
  if (!isRecord(value)) return false;
  return typeof value.range === "string"
    && ANALYSIS_RANGES.has(value.range)
    && typeof value.month === "string"
    && isNullableString(value.accountId)
    && typeof value.dateFrom === "string"
    && typeof value.dateTo === "string"
    && typeof value.previousDateFrom === "string"
    && typeof value.previousDateTo === "string"
    && typeof value.partial === "boolean"
    && isNullableString(value.partialMonthStart);
}

function isComparison(value: unknown) {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.incomeDeltaCents)
    && isNullableFiniteNumber(value.incomeChangeBps)
    && isFiniteNumber(value.expenseDeltaCents)
    && isNullableFiniteNumber(value.expenseChangeBps)
    && isFiniteNumber(value.netDeltaCents)
    && isNullableFiniteNumber(value.netChangeBps)
    && isFiniteNumber(value.savingsDeltaCents)
    && isNullableFiniteNumber(value.savingsChangeBps)
    && isNullableFiniteNumber(value.savingsRateDeltaBps);
}

function isPeriodAverage(value: unknown) {
  if (!isRecord(value)) return false;
  return isNonNegativeInteger(value.months)
    && isFiniteNumber(value.incomeCents)
    && isFiniteNumber(value.expenseCents)
    && isFiniteNumber(value.operatingNetCents)
    && isFiniteNumber(value.savingsCents)
    && isNullableFiniteNumber(value.savingsRateBps);
}

function isAverages(value: unknown) {
  if (!isRecord(value)) return false;
  const last3 = value.last3Months;
  const last6 = value.last6Months;
  return (last3 === null || isPeriodAverage(last3))
    && (last6 === null || isPeriodAverage(last6));
}

function isMonthlyRow(value: Record<string, unknown>) {
  return typeof value.monthStart === "string"
    && isNonNegativeInteger(value.rows)
    && isFiniteNumber(value.incomeCents)
    && isFiniteNumber(value.expenseCents)
    && isFiniteNumber(value.operatingNetCents)
    && isFiniteNumber(value.savingsCents)
    && isNullableFiniteNumber(value.savingsRateBps);
}

function isDailySpend(value: Record<string, unknown>) {
  return typeof value.date === "string"
    && isFiniteNumber(value.expenseCents)
    && isNonNegativeInteger(value.rows);
}

function isWeekdaySpend(value: Record<string, unknown>) {
  return isNonNegativeInteger(value.weekday)
    && (value.weekday as number) >= 1
    && (value.weekday as number) <= 7
    && isFiniteNumber(value.expenseCents)
    && isNonNegativeInteger(value.rows)
    && isFiniteNumber(value.averageCents);
}

function isAmountBand(value: Record<string, unknown>) {
  return typeof value.band === "string"
    && AMOUNT_BANDS.has(value.band)
    && isFiniteNumber(value.expenseCents)
    && isNonNegativeInteger(value.rows);
}

function isConcept(value: Record<string, unknown>) {
  return typeof value.concept === "string"
    && isFiniteNumber(value.expenseCents)
    && isNonNegativeInteger(value.rows)
    && isFiniteNumber(value.averageCents);
}

function isAccountSpend(value: Record<string, unknown>) {
  return typeof value.accountId === "string"
    && typeof value.accountName === "string"
    && isFiniteNumber(value.expenseCents)
    && isNonNegativeInteger(value.rows)
    && isFiniteNumber(value.averageCents);
}

function isTopTransaction(value: Record<string, unknown>) {
  const reviewState = value.reviewState;
  const duplicateState = value.duplicateState;
  return typeof value.transactionId === "string"
    && typeof value.bankDate === "string"
    && isFiniteNumber(value.amountCents)
    && typeof value.conceptNormalized === "string"
    && isNullableString(value.merchantId)
    && typeof value.merchantName === "string"
    && isNullableString(value.categoryId)
    && typeof value.categoryName === "string"
    && typeof value.accountId === "string"
    && typeof value.accountName === "string"
    && isOptionalNullableString(value.conceptOriginal)
    && isOptionalNullableFiniteNumber(value.balanceAfterCents)
    && (reviewState === undefined || reviewState === null || (typeof reviewState === "string" && REVIEW_STATES.has(reviewState)))
    && (duplicateState === undefined || duplicateState === null || (typeof duplicateState === "string" && DUPLICATE_STATES.has(duplicateState)))
    && isOptionalBoolean(value.hasManualOverride);
}

function isTrend(value: unknown) {
  if (!isRecord(value)) return false;
  return typeof value.direction === "string"
    && TREND_DIRECTIONS.has(value.direction)
    && isNullableFiniteNumber(value.delta)
    && isNullableFiniteNumber(value.recentAverage)
    && isNullableFiniteNumber(value.previousAverage)
    && isNonNegativeInteger(value.sampleMonths);
}

function isTrends(value: unknown) {
  if (!isRecord(value)) return false;
  return isTrend(value.income)
    && isTrend(value.expense)
    && isTrend(value.savings)
    && isTrend(value.net)
    && isTrend(value.savingsRate);
}

function isDriver(value: Record<string, unknown>) {
  return isNullableString(value.id)
    && typeof value.name === "string"
    && isFiniteNumber(value.expenseCents)
    && isFiniteNumber(value.previousExpenseCents)
    && isFiniteNumber(value.deltaCents)
    && isNullableFiniteNumber(value.changeBps)
    && isNullableFiniteNumber(value.shareBps)
    && isNonNegativeInteger(value.rows)
    && isNonNegativeInteger(value.previousRows)
    && isNullableString(value.href);
}

function isMerchantDriver(value: Record<string, unknown>) {
  return isDriver(value)
    && isNullableFiniteNumber(value.averageCents)
    && isNullableFiniteNumber(value.habitualAverageCents)
    && isNonNegativeInteger(value.habitualRows)
    && isNullableFiniteNumber(value.habitualVariationBps);
}

function isConcentration(value: unknown) {
  return isRecord(value)
    && isNullableFiniteNumber(value.top3CategoryBps)
    && isNullableFiniteNumber(value.top3MerchantBps);
}

function isAnomaly(value: Record<string, unknown>) {
  return typeof value.transactionId === "string"
    && typeof value.bankDate === "string"
    && isFiniteNumber(value.amountCents)
    && isNullableString(value.merchantId)
    && typeof value.merchantName === "string"
    && isNullableString(value.categoryId)
    && typeof value.categoryName === "string"
    && typeof value.conceptNormalized === "string"
    && isFiniteNumber(value.habitualCents)
    && isNonNegativeInteger(value.historyRows)
    && isNullableFiniteNumber(value.variationBps)
    && typeof value.href === "string";
}

function isFixedVariable(value: unknown) {
  return isRecord(value)
    && typeof value.available === "boolean"
    && isNonNegativeInteger(value.reliableRecurrences)
    && isFiniteNumber(value.fixedExpenseCents)
    && isFiniteNumber(value.variableExpenseCents)
    && isNullableFiniteNumber(value.fixedShareBps);
}

function isBudgetTotal(value: unknown) {
  if (!isRecord(value)) return false;
  return isOptionalFiniteNumber(value.automaticAmountCents)
    && isOptionalNullableFiniteNumber(value.manualAmountCents)
    && isFiniteNumber(value.effectiveAmountCents)
    && isFiniteNumber(value.actualExpenseCents)
    && isFiniteNumber(value.remainingCents)
    && isNullableFiniteNumber(value.progressBps)
    && typeof value.status === "string";
}

function isBudgetCategory(value: Record<string, unknown>) {
  return isNullableString(value.categoryId)
    && isNullableString(value.categoryName)
    && isFiniteNumber(value.effectiveAmountCents)
    && isFiniteNumber(value.actualExpenseCents)
    && isFiniteNumber(value.remainingCents)
    && isNullableFiniteNumber(value.progressBps)
    && typeof value.status === "string";
}

function isBudget(value: unknown) {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return typeof value.month === "string"
    && (value.total === null || isBudgetTotal(value.total))
    && everyRecord(value.overCategories, isBudgetCategory)
    && isOptionalBoolean(value.categoryDetailDeferred);
}

function isForecast(value: unknown) {
  if (value === null) return true;
  if (!isRecord(value) || !isRecord(value.period) || !isRecord(value.summary)) return false;
  return typeof value.period.dateFrom === "string"
    && typeof value.period.dateTo === "string"
    && isNullableString(value.period.accountId)
    && isNonNegativeInteger(value.summary.plannedItems)
    && isFiniteNumber(value.summary.projectedNetCents)
    && isFiniteNumber(value.summary.projectedIncomeCents)
    && isFiniteNumber(value.summary.projectedExpenseCents)
    && isNullableFiniteNumber(value.summary.projectedClosingBalanceCents)
    && isNullableFiniteNumber(value.summary.openingBalanceCents)
    && isOptionalBoolean(value.detailDeferred);
}

function isAccount(value: Record<string, unknown>) {
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.lifecycle === "string";
}

export function isAnalysisSnapshot(value: unknown): value is AnalysisSnapshot {
  if (!isRecord(value) || value.contractVersion !== 2) return false;

  const quality = value.quality;
  const principles = value.principles;

  if (!isSelection(value.selection)
    || !isPeriod(value.current)
    || !isPeriod(value.previous)
    || !isComparison(value.comparison)
    || !isAverages(value.averages)
    || !isTrends(value.trends)
    || !isConcentration(value.concentration)
    || !isFixedVariable(value.fixedVariable)
    || !isBudget(value.budget)
    || !isForecast(value.forecast)) {
    return false;
  }

  if (!everyRecord(value.history, isMonthlyRow)
    || !everyRecord(value.dailySpend, isDailySpend)
    || !everyRecord(value.weekdaySpend, isWeekdaySpend)
    || !everyRecord(value.amountBands, isAmountBand)
    || !everyRecord(value.concepts, isConcept)
    || !everyRecord(value.accountSpend, isAccountSpend)
    || !everyRecord(value.topTransactions, isTopTransaction)
    || !everyRecord(value.categoryDrivers, isDriver)
    || !everyRecord(value.merchantDrivers, isMerchantDriver)
    || !everyRecord(value.changeDrivers, isDriver)
    || !everyRecord(value.anomalies, isAnomaly)
    || !everyRecord(value.accounts, isAccount)) {
    return false;
  }

  if (!isRecord(quality)
    || quality.reconciled !== true
    || !isFiniteNumber(quality.categoryExpenseCents)
    || !isNonNegativeInteger(quality.expenseRows)
    || !isNonNegativeInteger(quality.excludedRows)
    || !isNonNegativeInteger(quality.confirmedDuplicateRows)) {
    return false;
  }

  return isRecord(principles)
    && principles.bankSource === "read_only"
    && principles.totals === "financial_period"
    && principles.history === "financial_monthly_series"
    && principles.drivers === "financial_transaction_facts_aggregate"
    && principles.anomalies === "deterministic_history_threshold"
    && principles.generativeAi === false;
}
