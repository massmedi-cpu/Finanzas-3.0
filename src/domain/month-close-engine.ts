export interface MonthCloseSummaryInput {
  movementCount: number;
  pendingReview: number;
  unreconciled: number;
  uncategorized: number;
  transferCount: number;
  income: number;
  expenses: number;
  netCashFlow: number;
}

export interface MonthCloseBudgetInput {
  assigned: number;
  spent: number;
}

export interface MonthCloseAssessmentInput {
  yearMonth: string;
  today: string;
  summary: MonthCloseSummaryInput;
  duplicateGroups: number;
  budgets: MonthCloseBudgetInput[];
}

export type MonthCloseIssueLevel = 'blocker' | 'warning' | 'ok';

export interface MonthCloseIssue {
  id: string;
  level: MonthCloseIssueLevel;
  title: string;
  detail: string;
  count?: number;
}

export interface MonthCloseAssessment {
  ready: boolean;
  score: number;
  blockers: MonthCloseIssue[];
  warnings: MonthCloseIssue[];
  checks: MonthCloseIssue[];
  overspentCategories: number;
  totalAssigned: number;
  totalSpentAgainstBudget: number;
}

function n(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function assessMonthClose(input: MonthCloseAssessmentInput): MonthCloseAssessment {
  const summary = input.summary;
  const blockers: MonthCloseIssue[] = [];
  const warnings: MonthCloseIssue[] = [];
  const checks: MonthCloseIssue[] = [];
  const currentMonth = /^\d{4}-\d{2}/.test(input.today) ? input.today.slice(0, 7) : '';

  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) {
    blockers.push({ id: 'invalid-month', level: 'blocker', title: 'Periodo no válido', detail: 'El cierre necesita un mes en formato AAAA-MM.' });
  } else if (currentMonth && input.yearMonth >= currentMonth) {
    blockers.push({ id: 'month-open', level: 'blocker', title: 'El periodo todavía está abierto', detail: 'Solo se puede cerrar un mes que ya haya terminado.' });
  } else {
    checks.push({ id: 'month-finished', level: 'ok', title: 'Periodo finalizado', detail: 'El mes ya ha terminado y puede entrar en proceso de cierre.' });
  }

  if (n(summary.movementCount) <= 0) {
    blockers.push({ id: 'no-movements', level: 'blocker', title: 'Sin movimientos', detail: 'No hay movimientos efectivos en este periodo.' });
  } else {
    checks.push({ id: 'movements-present', level: 'ok', title: 'Movimientos disponibles', detail: `${Math.trunc(n(summary.movementCount))} movimientos efectivos incluidos.` });
  }

  const blockingCounts: Array<[string, string, string, number]> = [
    ['pending-review', 'Revisión pendiente', 'Hay movimientos que todavía requieren revisión.', n(summary.pendingReview)],
    ['unreconciled', 'Conciliación pendiente', 'Hay movimientos que todavía no constan como conciliados.', n(summary.unreconciled)],
    ['uncategorized', 'Categorías pendientes', 'Hay movimientos sin categoría efectiva.', n(summary.uncategorized)],
    ['duplicates', 'Duplicados pendientes', 'Hay grupos de posibles duplicados del periodo que deben resolverse.', n(input.duplicateGroups)],
  ];

  for (const [id, title, detail, count] of blockingCounts) {
    if (count > 0) blockers.push({ id, level: 'blocker', title, detail, count: Math.trunc(count) });
    else checks.push({ id, level: 'ok', title: title.replace(' pendiente', ' resuelta').replace(' pendientes', ' resueltos'), detail: 'Sin incidencias abiertas.' });
  }

  const budgets = Array.isArray(input.budgets) ? input.budgets : [];
  const totalAssigned = budgets.reduce((sum, row) => sum + Math.max(0, n(row.assigned)), 0);
  const totalSpentAgainstBudget = budgets.reduce((sum, row) => sum + Math.max(0, n(row.spent)), 0);
  const overspentCategories = budgets.filter((row) => n(row.assigned) > 0 && n(row.spent) > n(row.assigned) + 0.005).length;

  if (budgets.length === 0 || totalAssigned <= 0) {
    warnings.push({ id: 'no-budget', level: 'warning', title: 'Sin presupuesto de referencia', detail: 'El mes puede cerrarse, pero no habrá análisis completo de desviaciones contra presupuesto.' });
  } else if (overspentCategories > 0) {
    warnings.push({ id: 'budget-overrun', level: 'warning', title: 'Desviaciones de presupuesto', detail: `${overspentCategories} categorías han superado lo asignado.`, count: overspentCategories });
  } else {
    checks.push({ id: 'budget-controlled', level: 'ok', title: 'Presupuesto controlado', detail: 'Ninguna categoría presupuestada ha superado lo asignado.' });
  }

  if (n(summary.netCashFlow) < 0) {
    warnings.push({ id: 'negative-cash-flow', level: 'warning', title: 'Cash flow negativo', detail: 'El mes termina con más gastos que ingresos; conviene documentar la causa antes de cerrar.' });
  } else {
    checks.push({ id: 'cash-flow', level: 'ok', title: 'Cash flow no negativo', detail: 'Los ingresos efectivos cubren los gastos efectivos del periodo.' });
  }

  const score = Math.max(0, Math.min(100,
    100
    - blockers.length * 18
    - warnings.length * 6
  ));

  return {
    ready: blockers.length === 0,
    score,
    blockers,
    warnings,
    checks,
    overspentCategories,
    totalAssigned,
    totalSpentAgainstBudget,
  };
}
