import { getMonthlySummary, isTransfer } from './finance-engine';
import type { BankingSourceRow } from './source-schema';

export interface MonthlyReportRow {
  month: string;
  income: number;
  expenses: number;
  net: number;
  transactions: number;
}

export interface YearlyReport {
  year: string;
  income: number;
  expenses: number;
  net: number;
  transactions: number;
  transfersExcluded: number;
}

export function getAvailableMonths(rows: BankingSourceRow[]): string[] {
  return [...new Set(rows.map((row) => row.date.slice(0, 7)).filter((value) => /^\d{4}-\d{2}$/.test(value)))]
    .sort((a, b) => b.localeCompare(a));
}

export function getMonthlyReport(rows: BankingSourceRow[], limit = 12): MonthlyReportRow[] {
  return getAvailableMonths(rows)
    .slice(0, limit)
    .map((month) => {
      const summary = getMonthlySummary(rows, month);
      return {
        month,
        income: summary.income,
        expenses: summary.expenses,
        net: summary.netCashFlow,
        transactions: summary.transactionCount,
      };
    });
}

export function getYearlyReport(rows: BankingSourceRow[], year: string): YearlyReport {
  const months = getAvailableMonths(rows).filter((month) => month.startsWith(`${year}-`));
  const summaries = months.map((month) => getMonthlySummary(rows, month));
  const yearRows = rows.filter((row) => row.date.startsWith(`${year}-`));

  return {
    year,
    income: summaries.reduce((sum, item) => sum + item.income, 0),
    expenses: summaries.reduce((sum, item) => sum + item.expenses, 0),
    net: summaries.reduce((sum, item) => sum + item.netCashFlow, 0),
    transactions: summaries.reduce((sum, item) => sum + item.transactionCount, 0),
    transfersExcluded: yearRows.filter(isTransfer).length,
  };
}
