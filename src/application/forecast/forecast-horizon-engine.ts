import type { ForecastItem, ForecastSnapshot } from "./forecast-contract";

export type ForecastHorizonKey = "month_end" | "days_30" | "months_3" | "months_12";

export type ForecastHorizon = {
  key: ForecastHorizonKey;
  label: string;
  date: string;
  projectedIncomeCents: number;
  projectedExpenseCents: number;
  projectedNetCents: number;
  projectedBalanceCents: number;
  confidenceScore: number;
  confidenceLabel: "Alta" | "Media" | "Baja" | "Sin datos";
  projectedItems: number;
  originCounts: Record<ForecastItem["origin"], number>;
};

export type ForecastHorizonSummary = {
  dateFrom: string;
  openingBalanceCents: number;
  horizons: ForecastHorizon[];
};

const ORIGIN_ZERO: Record<ForecastItem["origin"], number> = {
  known: 0,
  recurring: 0,
  budget: 0,
  manual: 0,
  inferred: 0,
};

function parseDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addForecastDays(date: string, days: number) {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}

export function addForecastMonths(date: string, months: number) {
  const source = parseDate(date);
  const day = source.getUTCDate();
  const result = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0, 12)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return isoDate(result);
}

export function forecastMonthEnd(date: string) {
  const source = parseDate(date);
  return isoDate(new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0, 12)));
}

export function forecastHorizonEndDate(dateFrom: string) {
  return addForecastMonths(dateFrom, 12);
}

function confidenceFactor(confidence: ForecastItem["confidence"]) {
  if (confidence === "high") return 1;
  if (confidence === "medium") return 0.67;
  return 0.33;
}

function confidenceLabel(score: number, hasItems: boolean): ForecastHorizon["confidenceLabel"] {
  if (!hasItems) return "Sin datos";
  if (score >= 80) return "Alta";
  if (score >= 55) return "Media";
  return "Baja";
}

function horizonFromItems(
  snapshot: ForecastSnapshot,
  key: ForecastHorizonKey,
  label: string,
  date: string,
): ForecastHorizon {
  const items = snapshot.items.filter((item) =>
    item.affectsProjection
    && item.date >= snapshot.period.dateFrom
    && item.date <= date,
  );

  let projectedIncomeCents = 0;
  let projectedExpenseCents = 0;
  let confidenceWeightedCents = 0;
  let confidenceBaseCents = 0;
  const originCounts = { ...ORIGIN_ZERO };

  for (const item of items) {
    const effect = item.projectionEffectCents;
    if (effect > 0) projectedIncomeCents += effect;
    if (effect < 0) projectedExpenseCents += Math.abs(effect);
    const weight = Math.abs(effect);
    confidenceWeightedCents += weight * confidenceFactor(item.confidence);
    confidenceBaseCents += weight;
    originCounts[item.origin] += 1;
  }

  const projectedNetCents = projectedIncomeCents - projectedExpenseCents;
  const score = confidenceBaseCents > 0
    ? Math.round((confidenceWeightedCents / confidenceBaseCents) * 100)
    : 0;

  return {
    key,
    label,
    date,
    projectedIncomeCents,
    projectedExpenseCents,
    projectedNetCents,
    projectedBalanceCents: snapshot.summary.openingBalanceCents + projectedNetCents,
    confidenceScore: score,
    confidenceLabel: confidenceLabel(score, confidenceBaseCents > 0),
    projectedItems: items.length,
    originCounts,
  };
}

export function buildForecastHorizonSummary(snapshot: ForecastSnapshot): ForecastHorizonSummary {
  const from = snapshot.period.dateFrom;
  const horizonSpecs: Array<[ForecastHorizonKey, string, string]> = [
    ["month_end", "Fin de mes", forecastMonthEnd(from)],
    ["days_30", "30 días", addForecastDays(from, 30)],
    ["months_3", "3 meses", addForecastMonths(from, 3)],
    ["months_12", "12 meses", addForecastMonths(from, 12)],
  ];

  return {
    dateFrom: from,
    openingBalanceCents: snapshot.summary.openingBalanceCents,
    horizons: horizonSpecs.map(([key, label, date]) => horizonFromItems(snapshot, key, label, date)),
  };
}
