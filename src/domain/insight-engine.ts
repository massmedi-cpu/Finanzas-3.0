import type { BudgetMonthSummary } from './budget-engine';
import type { MonthlySummary } from './finance-engine';
import type { LiquidityRisk } from './forecast-engine';
import type { CategorySpending } from './category-analysis';

export type InsightSeverity = 'positive' | 'info' | 'warning' | 'critical';

export interface FinancialInsight {
  id: string;
  title: string;
  message: string;
  evidence: string;
  severity: InsightSeverity;
}

export interface InsightInput {
  month: string;
  current: MonthlySummary;
  previous?: MonthlySummary | null;
  budget?: BudgetMonthSummary | null;
  topCategory?: CategorySpending | null;
  liquidity?: LiquidityRisk | null;
  pendingReview: number;
  duplicateGroups: number;
  netWorthChange?: number | null;
}

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function buildFinancialInsights(input: InsightInput): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const savingsRate = input.current.income > 0 ? (input.current.netCashFlow / input.current.income) * 100 : null;

  if (savingsRate !== null) {
    if (savingsRate >= 20) {
      insights.push({
        id: 'savings-rate-positive',
        title: 'Buen margen de ahorro en el mes',
        message: `El cash flow equivale al ${percent.format(savingsRate)}% de los ingresos del periodo.`,
        evidence: `${euro.format(input.current.income)} de ingresos y ${euro.format(input.current.expenses)} de gastos en ${input.month}.`,
        severity: 'positive',
      });
    } else if (savingsRate < 0) {
      insights.push({
        id: 'savings-rate-negative',
        title: 'El mes está gastando más de lo que ingresa',
        message: `El cash flow del periodo es ${euro.format(input.current.netCashFlow)}.`,
        evidence: `${euro.format(input.current.income)} de ingresos frente a ${euro.format(input.current.expenses)} de gastos en ${input.month}.`,
        severity: 'warning',
      });
    }
  }

  if (input.previous) {
    const expenseChange = pctChange(input.current.expenses, input.previous.expenses);
    if (expenseChange !== null && Math.abs(expenseChange) >= 10) {
      insights.push({
        id: 'expense-change',
        title: expenseChange > 0 ? 'El gasto ha subido frente al mes anterior' : 'El gasto ha bajado frente al mes anterior',
        message: `${expenseChange > 0 ? '+' : ''}${percent.format(expenseChange)}% de variación en gasto.`,
        evidence: `${euro.format(input.current.expenses)} este mes frente a ${euro.format(input.previous.expenses)} el mes anterior.`,
        severity: expenseChange > 0 ? 'warning' : 'positive',
      });
    }
  }

  if (input.budget) {
    if (input.budget.overspent > 0) {
      insights.push({
        id: 'budget-overspent',
        title: 'Hay sobres con gasto por encima de lo disponible',
        message: `${euro.format(input.budget.overspent)} de sobregasto acumulado entre categorías.`,
        evidence: `${euro.format(input.budget.assigned)} asignados y ${euro.format(input.budget.spent)} gastados en los sobres del periodo.`,
        severity: 'warning',
      });
    } else if (input.budget.assigned > 0) {
      insights.push({
        id: 'budget-controlled',
        title: 'Los sobres activos están dentro de lo disponible',
        message: `Quedan ${euro.format(input.budget.available)} disponibles entre categorías.`,
        evidence: `Asignado ${euro.format(input.budget.assigned)} · gastado ${euro.format(input.budget.spent)}.`,
        severity: 'positive',
      });
    }
  }

  if (input.topCategory && input.topCategory.amount > 0) {
    insights.push({
      id: 'top-category',
      title: `Mayor gasto: ${input.topCategory.category}`,
      message: `${euro.format(input.topCategory.amount)} en ${input.topCategory.transactions} movimientos.`,
      evidence: `Es la categoría con mayor gasto real en ${input.month}; no incluye traspasos internos.`,
      severity: 'info',
    });
  }

  if (input.liquidity?.firstNegativeDate) {
    insights.push({
      id: 'liquidity-risk',
      title: 'La previsión detecta riesgo de saldo negativo',
      message: `La primera fecha proyectada por debajo de cero es ${input.liquidity.firstNegativeDate}.`,
      evidence: `Mínimo proyectado ${euro.format(input.liquidity.lowestBalance)} según recurrentes validados y movimientos planificados.`,
      severity: 'critical',
    });
  } else if (input.liquidity) {
    insights.push({
      id: 'liquidity-ok',
      title: 'Sin saldo negativo en el horizonte analizado',
      message: `El mínimo proyectado se mantiene en ${euro.format(input.liquidity.lowestBalance)}.`,
      evidence: 'Cálculo basado en recurrentes detectados/validados y movimientos futuros planificados.',
      severity: 'positive',
    });
  }

  if (input.pendingReview > 0 || input.duplicateGroups > 0) {
    insights.push({
      id: 'data-quality',
      title: 'Quedan datos por revisar antes de dar el mes por cerrado',
      message: `${input.pendingReview} movimientos pendientes y ${input.duplicateGroups} grupos de posibles duplicados.`,
      evidence: 'La aplicación los mantiene visibles para no convertir una detección automática en un dato definitivo.',
      severity: 'warning',
    });
  }

  if (input.netWorthChange !== null && input.netWorthChange !== undefined && Math.abs(input.netWorthChange) >= 1) {
    insights.push({
      id: 'net-worth-change',
      title: input.netWorthChange >= 0 ? 'El patrimonio conocido ha aumentado' : 'El patrimonio conocido ha disminuido',
      message: `${input.netWorthChange >= 0 ? '+' : ''}${euro.format(input.netWorthChange)} frente al cierre anterior disponible.`,
      evidence: 'Se usan los últimos saldos conocidos de cada cuenta hasta cada cierre mensual.',
      severity: input.netWorthChange >= 0 ? 'positive' : 'info',
    });
  }

  return insights.slice(0, 7);
}
