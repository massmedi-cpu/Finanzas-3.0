import type { ForecastSnapshot } from "./forecast-contract";

export type ForecastScenarioKey = "expected" | "conservative" | "optimistic";

export type ForecastScenarioAssumptions = {
  incomeAdjustmentPercent: number;
  expenseAdjustmentPercent: number;
};

export type EditableForecastScenarioAssumptions = {
  conservative: ForecastScenarioAssumptions;
  optimistic: ForecastScenarioAssumptions;
};

export type ForecastScenarioResult = {
  key: ForecastScenarioKey;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  closingBalanceCents: number;
  assumptions: ForecastScenarioAssumptions;
};

export const FORECAST_SCENARIO_STORAGE_KEY = "financial-app:forecast-scenarios:v1";

export const DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS: EditableForecastScenarioAssumptions = {
  conservative: {
    incomeAdjustmentPercent: -5,
    expenseAdjustmentPercent: 10,
  },
  optimistic: {
    incomeAdjustmentPercent: 5,
    expenseAdjustmentPercent: -5,
  },
};

const MIN_ADJUSTMENT_PERCENT = -100;
const MAX_ADJUSTMENT_PERCENT = 100;

export function normalizeForecastScenarioPercent(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(MIN_ADJUSTMENT_PERCENT, Math.min(MAX_ADJUSTMENT_PERCENT, Math.round(parsed)));
}

export function normalizeForecastScenarioAssumptions(
  value: unknown,
): EditableForecastScenarioAssumptions {
  const candidate = value && typeof value === "object"
    ? value as Partial<Record<keyof EditableForecastScenarioAssumptions, Partial<ForecastScenarioAssumptions>>>
    : {};

  return {
    conservative: {
      incomeAdjustmentPercent: normalizeForecastScenarioPercent(
        candidate.conservative?.incomeAdjustmentPercent,
        DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS.conservative.incomeAdjustmentPercent,
      ),
      expenseAdjustmentPercent: normalizeForecastScenarioPercent(
        candidate.conservative?.expenseAdjustmentPercent,
        DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS.conservative.expenseAdjustmentPercent,
      ),
    },
    optimistic: {
      incomeAdjustmentPercent: normalizeForecastScenarioPercent(
        candidate.optimistic?.incomeAdjustmentPercent,
        DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS.optimistic.incomeAdjustmentPercent,
      ),
      expenseAdjustmentPercent: normalizeForecastScenarioPercent(
        candidate.optimistic?.expenseAdjustmentPercent,
        DEFAULT_FORECAST_SCENARIO_ASSUMPTIONS.optimistic.expenseAdjustmentPercent,
      ),
    },
  };
}

function adjustCents(baseCents: number, adjustmentPercent: number): number {
  const normalized = normalizeForecastScenarioPercent(adjustmentPercent, 0);
  return Math.round(baseCents * (100 + normalized) / 100);
}

export function calculateForecastScenario(
  summary: ForecastSnapshot["summary"],
  key: ForecastScenarioKey,
  assumptions: ForecastScenarioAssumptions,
): ForecastScenarioResult {
  const normalized = key === "expected"
    ? { incomeAdjustmentPercent: 0, expenseAdjustmentPercent: 0 }
    : {
        incomeAdjustmentPercent: normalizeForecastScenarioPercent(assumptions.incomeAdjustmentPercent, 0),
        expenseAdjustmentPercent: normalizeForecastScenarioPercent(assumptions.expenseAdjustmentPercent, 0),
      };

  const incomeCents = adjustCents(summary.projectedIncomeCents, normalized.incomeAdjustmentPercent);
  const expenseCents = adjustCents(summary.projectedExpenseCents, normalized.expenseAdjustmentPercent);
  const netCents = incomeCents - expenseCents;
  const closingBalanceCents = summary.openingBalanceCents + netCents;

  return {
    key,
    incomeCents,
    expenseCents,
    netCents,
    closingBalanceCents,
    assumptions: normalized,
  };
}

export function buildForecastScenarios(
  snapshot: ForecastSnapshot,
  assumptions: EditableForecastScenarioAssumptions,
): ForecastScenarioResult[] {
  return [
    calculateForecastScenario(snapshot.summary, "expected", {
      incomeAdjustmentPercent: 0,
      expenseAdjustmentPercent: 0,
    }),
    calculateForecastScenario(snapshot.summary, "conservative", assumptions.conservative),
    calculateForecastScenario(snapshot.summary, "optimistic", assumptions.optimistic),
  ];
}
