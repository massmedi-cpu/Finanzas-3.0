import type { AnalysisSnapshot } from "./analysis-engine";

const ANALYSIS_RANGES = new Set(["1m", "3m", "6m", "12m", "ytd"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown) {
  return value === null || isFiniteNumber(value);
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

export function isAnalysisSnapshot(value: unknown): value is AnalysisSnapshot {
  if (!isRecord(value) || value.contractVersion !== 2) return false;

  const selection = value.selection;
  const quality = value.quality;
  const principles = value.principles;
  const comparison = value.comparison;
  const trends = value.trends;

  if (!isRecord(selection)
    || typeof selection.range !== "string"
    || !ANALYSIS_RANGES.has(selection.range)
    || typeof selection.month !== "string"
    || typeof selection.dateFrom !== "string"
    || typeof selection.dateTo !== "string"
    || typeof selection.previousDateFrom !== "string"
    || typeof selection.previousDateTo !== "string"
    || typeof selection.partial !== "boolean") {
    return false;
  }

  if (!isPeriod(value.current) || !isPeriod(value.previous)) return false;
  if (!isRecord(comparison) || !isRecord(trends)) return false;

  if (!Array.isArray(value.history)
    || !Array.isArray(value.categoryDrivers)
    || !Array.isArray(value.merchantDrivers)
    || !Array.isArray(value.changeDrivers)
    || !Array.isArray(value.anomalies)
    || !Array.isArray(value.accounts)) {
    return false;
  }

  if (!isRecord(quality)
    || quality.reconciled !== true
    || !isFiniteNumber(quality.categoryExpenseCents)
    || !isFiniteNumber(quality.expenseRows)
    || !isFiniteNumber(quality.excludedRows)
    || !isFiniteNumber(quality.confirmedDuplicateRows)) {
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
