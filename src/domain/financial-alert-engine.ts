import type { ForecastMovement, LiquidityRisk } from './forecast-engine';

export type FinancialAlertSeverity = 'critical' | 'warning' | 'info';

export interface GoalRiskInput {
  id: string;
  name: string;
  monthlyGap: number;
  targetDate: string | null;
  projectedCompletionDate: string | null;
}

export interface FinancialAlert {
  id: string;
  severity: FinancialAlertSeverity;
  title: string;
  message: string;
  evidence: string;
  href: string;
}

export interface FinancialAlertInput {
  asOfDate: string;
  knownBalance: number;
  liquidity: LiquidityRisk;
  upcoming: ForecastMovement[];
  pendingReview: number;
  duplicateGroups: number;
  uncategorized: number;
  goalRisks: GoalRiskInput[];
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function daysBetween(from: string, to: string): number | null {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return null;
  return Math.round((end.valueOf() - start.valueOf()) / 86_400_000);
}

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function buildFinancialAlerts(input: FinancialAlertInput): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];

  if (input.liquidity.firstNegativeDate) {
    alerts.push({
      id: 'liquidity-negative',
      severity: 'critical',
      title: 'Riesgo de saldo negativo',
      message: `La previsión cae por debajo de cero el ${input.liquidity.firstNegativeDate}.`,
      evidence: `Mínimo previsto ${euro.format(input.liquidity.lowestBalance)} con recurrentes y eventos planificados actuales.`,
      href: '/prevision',
    });
  }

  const relevantExpense = input.upcoming
    .filter((movement) => {
      if (movement.amount >= 0) return false;
      const days = daysBetween(input.asOfDate, movement.expectedDate);
      return days !== null && days >= 0 && days <= 30;
    })
    .sort((a, b) => a.amount - b.amount)[0];
  const largeExpenseThreshold = Math.max(100, Math.abs(input.knownBalance) * 0.15);
  if (relevantExpense && Math.abs(relevantExpense.amount) >= largeExpenseThreshold) {
    alerts.push({
      id: `large-upcoming:${relevantExpense.id}`,
      severity: 'warning',
      title: 'Cargo relevante en los próximos 30 días',
      message: `${relevantExpense.description}: ${euro.format(Math.abs(relevantExpense.amount))} previsto para ${relevantExpense.expectedDate}.`,
      evidence: `Equivale al ${Math.round(Math.abs(relevantExpense.amount) / Math.max(Math.abs(input.knownBalance), 1) * 100)}% del saldo conocido actual.`,
      href: '/prevision',
    });
  }

  for (const goal of input.goalRisks.slice(0, 2)) {
    alerts.push({
      id: `goal-risk:${goal.id}`,
      severity: 'warning',
      title: `Objetivo en riesgo: ${goal.name}`,
      message: `Faltan ${euro.format(goal.monthlyGap)}/mes para mantener el ritmo requerido.`,
      evidence: goal.targetDate
        ? `Fecha objetivo ${goal.targetDate}${goal.projectedCompletionDate ? ` · ritmo actual apunta a ${goal.projectedCompletionDate}` : ''}.`
        : 'El objetivo no tiene una fecha que permita medir el ritmo.',
      href: '/objetivos',
    });
  }

  const qualityTotal = input.pendingReview + input.duplicateGroups + input.uncategorized;
  if (qualityTotal > 0) {
    alerts.push({
      id: 'data-quality',
      severity: input.pendingReview > 10 || input.duplicateGroups > 0 ? 'warning' : 'info',
      title: 'Hay datos pendientes antes de cerrar el periodo',
      message: `${input.pendingReview} pendientes · ${input.duplicateGroups} grupos duplicados · ${input.uncategorized} sin categoría.`,
      evidence: 'Las alertas financieras se apoyan en datos efectivos; revisar estas incidencias aumenta su fiabilidad.',
      href: '/revision',
    });
  }

  const order: Record<FinancialAlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 5);
}
