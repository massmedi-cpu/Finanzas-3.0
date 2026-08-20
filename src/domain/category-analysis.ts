import { isExpense, isTransfer } from './finance-engine';
import type { BankingSourceRow } from './source-schema';

export interface CategorySpending {
  category: string;
  amount: number;
  transactions: number;
}

export function getCategorySpending(rows: BankingSourceRow[], yearMonth: string): CategorySpending[] {
  const totals = new Map<string, CategorySpending>();

  for (const row of rows) {
    if (!row.date.startsWith(yearMonth) || isTransfer(row) || !isExpense(row)) continue;
    const category = row.category || 'Sin categoría';
    const current = totals.get(category) ?? { category, amount: 0, transactions: 0 };
    current.amount += Math.abs(Math.min(row.amount ?? 0, 0));
    current.transactions += 1;
    totals.set(category, current);
  }

  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}
