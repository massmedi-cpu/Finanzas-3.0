import { addMonths, type ForecastMovement } from './forecast-engine';
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
  const safeMonths = Math.max(1, Math.min(24, Math.trunc(months) || 6));
  const horizonDate = addMonths(fromDate, safeMonths);
  const net = forecast
    .filter((movement) => movement.expectedDate > fromDate && movement.expectedDate <= horizonDate)
    .reduce((sum, movement) => sum + movement.amount, 0);
  return net / safeMonths;
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
