import { addMonths, type ForecastMovement, type ScenarioInput } from './forecast-engine';
import type { GoalProjection } from './goal-engine';

export type GoalFundingStatus = 'covered' | 'tight' | 'shortfall' | 'no_due_goals';

export interface GoalFundingCapacity {
  projectedMonthlyNet: number;
  requiredMonthly: number;
  plannedMonthly: number;
  monthlyMargin: number;
  coveragePct: number | null;
  status: GoalFundingStatus;
}

export function averageMonthlyForecastNet(forecast: ForecastMovement[], fromDate: string, months = 6): number {
  const safeMonths = Math.max(1, Math.min(60, Math.trunc(months) || 6));
  const horizonDate = addMonths(fromDate, safeMonths);
  const net = forecast
    .filter((movement) => movement.expectedDate > fromDate && movement.expectedDate <= horizonDate)
    .reduce((sum, movement) => sum + movement.amount, 0);
  return net / safeMonths;
}

export function scenarioAverageMonthlyNet(forecast: ForecastMovement[], fromDate: string, scenario: ScenarioInput): number {
  const horizonMonths = Math.min(60, Math.max(1, Math.trunc(Number(scenario.horizon_months) || 12)));
  const horizonDate = addMonths(fromDate, horizonMonths);
  const incomeMultiplier = 1 + (Number(scenario.income_change_pct) || 0) / 100;
  const expenseMultiplier = 1 + (Number(scenario.expense_change_pct) || 0) / 100;
  const monthlyNetAdjustment = Number(scenario.monthly_net_adjustment) || 0;
  const monthlySavings = Math.max(0, Number(scenario.monthly_savings_allocation) || 0);

  const adjustedNet = forecast
    .filter((movement) => movement.expectedDate > fromDate && movement.expectedDate <= horizonDate)
    .reduce((sum, movement) => {
      if (movement.amount > 0) return sum + movement.amount * incomeMultiplier;
      return sum + movement.amount * expenseMultiplier;
    }, 0) + monthlyNetAdjustment * horizonMonths;

  return adjustedNet / horizonMonths - monthlySavings;
}

export function assessGoalFundingCapacity(projections: GoalProjection[], projectedMonthlyNet: number): GoalFundingCapacity {
  const active = projections.filter((projection) => projection.status !== 'completed');
  const requiredMonthly = active.reduce((sum, projection) => sum + (projection.requiredMonthlyContribution ?? 0), 0);
  const plannedMonthly = active.reduce((sum, projection) => sum + (projection.plannedMonthlyContribution ?? 0), 0);
  const safeProjectedNet = Number.isFinite(projectedMonthlyNet) ? projectedMonthlyNet : 0;
  const monthlyMargin = safeProjectedNet - requiredMonthly;
  const coveragePct = requiredMonthly > 0 ? Math.max(0, safeProjectedNet / requiredMonthly * 100) : null;

  let status: GoalFundingStatus = 'no_due_goals';
  if (requiredMonthly > 0) {
    if (safeProjectedNet >= requiredMonthly) status = 'covered';
    else if (safeProjectedNet > 0 && safeProjectedNet >= requiredMonthly * 0.8) status = 'tight';
    else status = 'shortfall';
  }

  return {
    projectedMonthlyNet: safeProjectedNet,
    requiredMonthly,
    plannedMonthly,
    monthlyMargin,
    coveragePct,
    status,
  };
}
