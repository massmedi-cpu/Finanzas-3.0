export type GoalStatus = 'completed' | 'on_track' | 'at_risk' | 'no_plan';

export interface GoalProjectionInput {
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  monthlyContribution?: number | null;
  asOfDate: string;
}

export interface GoalProjection {
  remaining: number;
  progressPct: number;
  monthsToTarget: number | null;
  requiredMonthlyContribution: number | null;
  plannedMonthlyContribution: number | null;
  monthlyGap: number | null;
  projectedCompletionDate: string | null;
  status: GoalStatus;
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthsBetweenInclusive(from: string, to: string): number | null {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return null;
  if (end < start) return 0;
  return Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1);
}

function addMonths(value: string, months: number): string | null {
  const date = parseDate(value);
  if (!date) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return formatDate(date);
}

export function projectGoal(input: GoalProjectionInput): GoalProjection {
  const target = Math.max(0, Number(input.targetAmount) || 0);
  const current = Math.max(0, Number(input.currentAmount) || 0);
  const remaining = Math.max(0, target - current);
  const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : 100;
  const monthly = input.monthlyContribution == null ? null : Math.max(0, Number(input.monthlyContribution) || 0);
  const monthsToTarget = input.targetDate ? monthsBetweenInclusive(input.asOfDate, input.targetDate) : null;

  if (remaining <= 0) {
    return {
      remaining: 0,
      progressPct: 100,
      monthsToTarget,
      requiredMonthlyContribution: 0,
      plannedMonthlyContribution: monthly,
      monthlyGap: 0,
      projectedCompletionDate: input.asOfDate,
      status: 'completed',
    };
  }

  const requiredMonthlyContribution = monthsToTarget === null
    ? null
    : monthsToTarget > 0
      ? remaining / monthsToTarget
      : remaining;

  const monthlyGap = requiredMonthlyContribution === null
    ? null
    : Math.max(0, requiredMonthlyContribution - (monthly ?? 0));

  let projectedCompletionDate: string | null = null;
  if (monthly && monthly > 0) {
    const monthsNeeded = Math.max(1, Math.ceil(remaining / monthly));
    projectedCompletionDate = addMonths(input.asOfDate, monthsNeeded - 1);
  }

  let status: GoalStatus = 'no_plan';
  if (monthly && monthly > 0) {
    status = requiredMonthlyContribution === null || monthly + 0.005 >= requiredMonthlyContribution ? 'on_track' : 'at_risk';
  } else if (requiredMonthlyContribution !== null) {
    status = 'at_risk';
  }

  return {
    remaining,
    progressPct,
    monthsToTarget,
    requiredMonthlyContribution,
    plannedMonthlyContribution: monthly,
    monthlyGap,
    projectedCompletionDate,
    status,
  };
}
