import { getMonthlySummary, isExpense, isTransfer } from './finance-engine';
import type { BankingSourceRow } from './source-schema';

export interface MonthlyReportRow {
  month: string;
  income: number;
  expenses: number;
  net: number;
  cumulativeNet: number;
  transactions: number;
}

export interface QuarterlyReportRow {
  quarter: 'T1' | 'T2' | 'T3' | 'T4';
  income: number;
  expenses: number;
  net: number;
  transactions: number;
}

export interface CategoryReportRow {
  category: string;
  amount: number;
  transactions: number;
  share: number;
}

export interface YearlyReport {
  year: string;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
  transactions: number;
  transfersExcluded: number;
}

export interface YearComparison {
  incomeDeltaPct: number | null;
  expensesDeltaPct: number | null;
  netDelta: number;
}

function baseSourceId(sourceId: string): string {
  const marker = '::split:';
  const index = sourceId.indexOf(marker);
  return index >= 0 ? sourceId.slice(0, index) : sourceId;
}

function uniqueTransactions(rows: BankingSourceRow[]): number {
  return new Set(rows.map((row) => baseSourceId(row.sourceId))).size;
}

export function getAvailableMonths(rows: BankingSourceRow[]): string[] {
  return [...new Set(rows.map((row) => row.date.slice(0, 7)).filter((value) => /^\d{4}-\d{2}$/.test(value)))]
    .sort((a, b) => b.localeCompare(a));
}

export function getAvailableYears(rows: BankingSourceRow[]): string[] {
  return [...new Set(getAvailableMonths(rows).map((month) => month.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
}

function monthlyRows(rows: BankingSourceRow[], months: string[]): MonthlyReportRow[] {
  let cumulativeNet = 0;
  return months.map((month) => {
    const summary = getMonthlySummary(rows, month);
    const monthRows = rows.filter((row) => row.date.startsWith(month));
    cumulativeNet += summary.netCashFlow;
    return {
      month,
      income: summary.income,
      expenses: summary.expenses,
      net: summary.netCashFlow,
      cumulativeNet,
      transactions: uniqueTransactions(monthRows),
    };
  });
}

export function getMonthlyReport(rows: BankingSourceRow[], limit = 12): MonthlyReportRow[] {
  const months = getAvailableMonths(rows).slice(0, limit).reverse();
  return monthlyRows(rows, months).reverse();
}

export function getMonthlyReportForYear(rows: BankingSourceRow[], year: string): MonthlyReportRow[] {
  const months = getAvailableMonths(rows)
    .filter((month) => month.startsWith(`${year}-`))
    .sort((a, b) => a.localeCompare(b));
  return monthlyRows(rows, months);
}

export function getYearlyReport(rows: BankingSourceRow[], year: string): YearlyReport {
  const yearRows = rows.filter((row) => row.date.startsWith(`${year}-`));
  const months = getAvailableMonths(yearRows);
  const summaries = months.map((month) => getMonthlySummary(yearRows, month));
  const income = summaries.reduce((sum, item) => sum + item.income, 0);
  const expenses = summaries.reduce((sum, item) => sum + item.expenses, 0);
  const net = income - expenses;
  const transferRows = yearRows.filter(isTransfer);

  return {
    year,
    income,
    expenses,
    net,
    savingsRate: income > 0 ? (net / income) * 100 : 0,
    transactions: uniqueTransactions(yearRows),
    transfersExcluded: uniqueTransactions(transferRows),
  };
}

export function getQuarterlyReport(rows: BankingSourceRow[], year: string): QuarterlyReportRow[] {
  const monthly = getMonthlyReportForYear(rows, year);
  const quarters: QuarterlyReportRow[] = [
    { quarter: 'T1', income: 0, expenses: 0, net: 0, transactions: 0 },
    { quarter: 'T2', income: 0, expenses: 0, net: 0, transactions: 0 },
    { quarter: 'T3', income: 0, expenses: 0, net: 0, transactions: 0 },
    { quarter: 'T4', income: 0, expenses: 0, net: 0, transactions: 0 },
  ];

  for (const item of monthly) {
    const monthNumber = Number(item.month.slice(5, 7));
    const index = Math.min(3, Math.max(0, Math.floor((monthNumber - 1) / 3)));
    const quarter = quarters[index];
    quarter.income += item.income;
    quarter.expenses += item.expenses;
    quarter.net += item.net;
    quarter.transactions += item.transactions;
  }

  return quarters;
}

export function getCategoryReport(rows: BankingSourceRow[], year: string, limit = 10): CategoryReportRow[] {
  const totals = new Map<string, { amount: number; transactionIds: Set<string> }>();

  for (const row of rows) {
    if (!row.date.startsWith(`${year}-`) || !isExpense(row) || isTransfer(row)) continue;
    const amount = Math.abs(Math.min(row.amount ?? 0, 0));
    if (amount <= 0) continue;
    const category = row.category.trim() || 'Sin categoría';
    const current = totals.get(category) ?? { amount: 0, transactionIds: new Set<string>() };
    current.amount += amount;
    current.transactionIds.add(baseSourceId(row.sourceId));
    totals.set(category, current);
  }

  const total = [...totals.values()].reduce((sum, item) => sum + item.amount, 0);
  return [...totals.entries()]
    .map(([category, value]) => ({
      category,
      amount: value.amount,
      transactions: value.transactionIds.size,
      share: total > 0 ? (value.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function compareYears(current: YearlyReport, previous: YearlyReport | null): YearComparison | null {
  if (!previous) return null;
  return {
    incomeDeltaPct: deltaPct(current.income, previous.income),
    expensesDeltaPct: deltaPct(current.expenses, previous.expenses),
    netDelta: current.net - previous.net,
  };
}
