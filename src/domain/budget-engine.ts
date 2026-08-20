import { getCategorySpending } from './category-analysis';
import type { BankingSourceRow } from './source-schema';

export interface BudgetInput {
  year_month: string;
  category: string;
  assigned: number | string;
  rollover: boolean;
}

export interface BudgetEnvelope {
  category: string;
  spent: number;
  transactions: number;
  assigned: number;
  carryIn: number;
  available: number;
  rollover: boolean;
}

export interface BudgetMonthSummary {
  assigned: number;
  spent: number;
  carryIn: number;
  available: number;
  overspent: number;
}

export function previousMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return yearMonth;
  const date = new Date(Date.UTC(year, month - 2, 1, 12));
  return date.toISOString().slice(0, 7);
}

function budgetMap(budgets: BudgetInput[]): Map<string, BudgetInput> {
  return new Map(budgets.map((budget) => [budget.category, budget]));
}

export function buildBudgetEnvelopes(
  rows: BankingSourceRow[],
  yearMonth: string,
  currentBudgets: BudgetInput[],
  previousBudgets: BudgetInput[],
): BudgetEnvelope[] {
  const currentSpending = getCategorySpending(rows, yearMonth);
  const priorMonth = previousMonth(yearMonth);
  const previousSpending = getCategorySpending(rows, priorMonth);
  const currentMap = budgetMap(currentBudgets);
  const previousMap = budgetMap(previousBudgets);
  const currentSpendMap = new Map(currentSpending.map((item) => [item.category, item]));
  const previousSpendMap = new Map(previousSpending.map((item) => [item.category, item.amount]));

  const categories = new Set<string>([
    ...currentSpendMap.keys(),
    ...currentMap.keys(),
    ...previousMap.keys(),
  ]);

  return [...categories].map((category) => {
    const current = currentMap.get(category);
    const previous = previousMap.get(category);
    const spending = currentSpendMap.get(category);
    const previousAssigned = Number(previous?.assigned) || 0;
    const previousSpent = previousSpendMap.get(category) || 0;
    const carryIn = previous?.rollover ? Math.max(0, previousAssigned - previousSpent) : 0;
    const assigned = Number(current?.assigned) || 0;
    const spent = spending?.amount || 0;

    return {
      category,
      spent,
      transactions: spending?.transactions || 0,
      assigned,
      carryIn,
      available: assigned + carryIn - spent,
      rollover: current?.rollover || false,
    };
  }).sort((a, b) => (b.assigned + b.carryIn > 0 ? 1 : 0) - (a.assigned + a.carryIn > 0 ? 1 : 0) || b.spent - a.spent || a.category.localeCompare(b.category, 'es'));
}

export function summarizeBudget(envelopes: BudgetEnvelope[]): BudgetMonthSummary {
  return envelopes.reduce((summary, envelope) => {
    summary.assigned += envelope.assigned;
    summary.spent += envelope.spent;
    summary.carryIn += envelope.carryIn;
    summary.available += envelope.available;
    if (envelope.available < 0) summary.overspent += Math.abs(envelope.available);
    return summary;
  }, { assigned: 0, spent: 0, carryIn: 0, available: 0, overspent: 0 });
}
