import type { ComparisonSnapshot } from "./comparison-engine";
import { resolveComparisonSelection } from "./comparison-selection";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function nonNegativeInteger(value: unknown) {
  return safeInteger(value) && (value as number) >= 0;
}

function nullableSafeInteger(value: unknown) {
  return value === null || safeInteger(value);
}

function nullableShare(value: unknown) {
  return value === null || (safeInteger(value) && (value as number) >= 0 && (value as number) <= 10_000);
}

function nullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function nullableUuid(value: unknown) {
  return value === null || (typeof value === "string" && UUID.test(value));
}

function nullableTransactionHref(value: unknown) {
  return value === null || (typeof value === "string" && value.startsWith("/transactions?"));
}

function isPeriod(value: unknown) {
  return record(value)
    && typeof value.dateFrom === "string"
    && typeof value.dateTo === "string"
    && nonNegativeInteger(value.incomeCents)
    && nonNegativeInteger(value.expenseCents)
    && safeInteger(value.operatingNetCents)
    && safeInteger(value.savingsCents)
    && nullableSafeInteger(value.savingsRateBps);
}

function isExactMetric(value: unknown, primary: number, reference: number, primaryDays: number, referenceDays: number) {
  if (!isMetric(value) || !record(value)) return false;
  const delta = primary - reference;
  const primaryDaily = Math.round(primary / primaryDays);
  const referenceDaily = Math.round(reference / referenceDays);
  const expectedChange = reference === 0 ? null : Math.round((delta / Math.abs(reference)) * 10_000);
  return value.primaryCents === primary
    && value.referenceCents === reference
    && value.deltaCents === delta
    && value.changeBps === expectedChange
    && value.primaryDailyCents === primaryDaily
    && value.referenceDailyCents === referenceDaily
    && value.dailyDeltaCents === primaryDaily - referenceDaily;
}

function isMetric(value: unknown) {
  return record(value)
    && safeInteger(value.primaryCents)
    && safeInteger(value.referenceCents)
    && safeInteger(value.deltaCents)
    && nullableSafeInteger(value.changeBps)
    && safeInteger(value.primaryDailyCents)
    && safeInteger(value.referenceDailyCents)
    && safeInteger(value.dailyDeltaCents);
}

function isDriver(value: unknown) {
  return record(value)
    && nullableUuid(value.id)
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && nonNegativeInteger(value.primaryExpenseCents)
    && nonNegativeInteger(value.referenceExpenseCents)
    && safeInteger(value.deltaCents)
    && nullableSafeInteger(value.changeBps)
    && nullableShare(value.primaryShareBps)
    && nullableShare(value.referenceShareBps)
    && nonNegativeInteger(value.primaryRows)
    && nonNegativeInteger(value.referenceRows)
    && nullableTransactionHref(value.primaryHref)
    && nullableTransactionHref(value.referenceHref);
}

function isAccount(value: unknown) {
  return record(value)
    && typeof value.id === "string"
    && UUID.test(value.id)
    && typeof value.name === "string"
    && typeof value.lifecycle === "string";
}

function isSelection(value: unknown) {
  if (!record(value)) return false;
  if (
    typeof value.today !== "string"
    || typeof value.primaryFrom !== "string"
    || typeof value.primaryTo !== "string"
    || typeof value.referenceFrom !== "string"
    || typeof value.referenceTo !== "string"
    || !nonNegativeInteger(value.primaryDays)
    || !nonNegativeInteger(value.referenceDays)
    || !nullableString(value.accountId)
    || typeof value.historyDateFrom !== "string"
    || typeof value.budgetMonth !== "string"
  ) return false;

  try {
    const expected = resolveComparisonSelection({
      primaryFrom: value.primaryFrom,
      primaryTo: value.primaryTo,
      referenceFrom: value.referenceFrom,
      referenceTo: value.referenceTo,
      accountId: value.accountId,
    }, value.today);
    return expected.primaryDays === value.primaryDays
      && expected.referenceDays === value.referenceDays
      && expected.historyDateFrom === value.historyDateFrom
      && expected.budgetMonth === value.budgetMonth;
  } catch {
    return false;
  }
}

export function isComparisonSnapshot(value: unknown): value is ComparisonSnapshot {
  if (!record(value) || value.contractVersion !== 1 || !isSelection(value.selection)) return false;
  if (!isPeriod(value.primary) || !isPeriod(value.reference)) return false;

  const selection = value.selection as Record<string, unknown>;
  const primary = value.primary as Record<string, unknown>;
  const reference = value.reference as Record<string, unknown>;
  if (
    primary.dateFrom !== selection.primaryFrom
    || primary.dateTo !== selection.primaryTo
    || reference.dateFrom !== selection.referenceFrom
    || reference.dateTo !== selection.referenceTo
  ) return false;

  const metrics = value.metrics;
  if (
    !record(metrics)
    || !isExactMetric(metrics.income, primary.incomeCents as number, reference.incomeCents as number, selection.primaryDays as number, selection.referenceDays as number)
    || !isExactMetric(metrics.expense, primary.expenseCents as number, reference.expenseCents as number, selection.primaryDays as number, selection.referenceDays as number)
    || !isExactMetric(metrics.operatingNet, primary.operatingNetCents as number, reference.operatingNetCents as number, selection.primaryDays as number, selection.referenceDays as number)
    || !isExactMetric(metrics.savings, primary.savingsCents as number, reference.savingsCents as number, selection.primaryDays as number, selection.referenceDays as number)
  ) return false;

  const savingsRate = value.savingsRate;
  if (
    !record(savingsRate)
    || !nullableSafeInteger(savingsRate.primaryBps)
    || !nullableSafeInteger(savingsRate.referenceBps)
    || !nullableSafeInteger(savingsRate.deltaBps)
  ) return false;
  const expectedSavingsRateDelta = primary.savingsRateBps !== null && reference.savingsRateBps !== null
    ? (primary.savingsRateBps as number) - (reference.savingsRateBps as number)
    : null;
  if (
    savingsRate.primaryBps !== primary.savingsRateBps
    || savingsRate.referenceBps !== reference.savingsRateBps
    || savingsRate.deltaBps !== expectedSavingsRateDelta
  ) return false;

  if (!Array.isArray(value.categoryDrivers) || !value.categoryDrivers.every(isDriver)) return false;
  if (!Array.isArray(value.merchantDrivers) || !value.merchantDrivers.every(isDriver)) return false;
  if (!Array.isArray(value.accounts) || !value.accounts.every(isAccount)) return false;

  const links = value.links;
  if (
    !record(links)
    || typeof links.primaryTransactions !== "string"
    || !links.primaryTransactions.startsWith("/transactions?")
    || typeof links.referenceTransactions !== "string"
    || !links.referenceTransactions.startsWith("/transactions?")
  ) return false;

  const quality = value.quality;
  if (
    !record(quality)
    || quality.reconciled !== true
    || !safeInteger(quality.primaryCategoryExpenseCents)
    || !safeInteger(quality.referenceCategoryExpenseCents)
    || !nonNegativeInteger(quality.primaryIncludedRows)
    || !nonNegativeInteger(quality.referenceIncludedRows)
    || !nonNegativeInteger(quality.primaryExcludedRows)
    || !nonNegativeInteger(quality.referenceExcludedRows)
  ) return false;

  let primaryCategoryTotal = 0;
  let referenceCategoryTotal = 0;
  for (const rawDriver of value.categoryDrivers) {
    const driver = rawDriver as Record<string, unknown>;
    if (driver.deltaCents !== (driver.primaryExpenseCents as number) - (driver.referenceExpenseCents as number)) return false;
    primaryCategoryTotal += driver.primaryExpenseCents as number;
    referenceCategoryTotal += driver.referenceExpenseCents as number;
    if (!safeInteger(primaryCategoryTotal) || !safeInteger(referenceCategoryTotal)) return false;
  }
  if (
    quality.primaryCategoryExpenseCents !== primaryCategoryTotal
    || quality.referenceCategoryExpenseCents !== referenceCategoryTotal
    || quality.primaryCategoryExpenseCents !== primary.expenseCents
    || quality.referenceCategoryExpenseCents !== reference.expenseCents
  ) return false;

  const principles = value.principles;
  return record(principles)
    && principles.bankSource === "read_only"
    && principles.totals === "financial_period"
    && principles.comparison === "deterministic_periods"
    && principles.drivers === "financial_transaction_facts_aggregate"
    && principles.generativeAi === false;
}
