import type { BankingSourceRow } from './source-schema';

export interface MonthlySummary {
  income: number;
  expenses: number;
  netCashFlow: number;
  transactionCount: number;
  needsReview: number;
}

export interface DuplicateCandidate {
  key: string;
  rows: BankingSourceRow[];
}

export interface AccountBalanceSnapshot {
  account: string;
  institution: string;
  identifier: string;
  balance: number;
  date: string;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('es-ES');
}

export function isTransfer(row: BankingSourceRow): boolean {
  const type = normalize(row.movementType);
  return type.includes('traspas') || (type.includes('transfer') && type.includes('intern'));
}

export function isIncome(row: BankingSourceRow): boolean {
  if (isTransfer(row)) return false;
  const type = normalize(row.movementType);
  return type.includes('ingreso') || (row.amount ?? 0) > 0;
}

export function isExpense(row: BankingSourceRow): boolean {
  if (isTransfer(row)) return false;
  const type = normalize(row.movementType);
  return type.includes('gasto') || (row.amount ?? 0) < 0;
}

export function needsReview(row: BankingSourceRow): boolean {
  const value = normalize(row.review);
  return value === 'sí' || value === 'si' || value === 'yes' || value === 'true';
}

export function getMonthlySummary(rows: BankingSourceRow[], yearMonth: string): MonthlySummary {
  const monthRows = rows.filter((row) => row.date.startsWith(yearMonth));
  let income = 0;
  let expenses = 0;
  let reviewCount = 0;

  for (const row of monthRows) {
    const amount = row.amount ?? 0;
    if (isIncome(row)) income += Math.max(amount, 0);
    if (isExpense(row)) expenses += Math.abs(Math.min(amount, 0));
    if (needsReview(row)) reviewCount += 1;
  }

  return {
    income,
    expenses,
    netCashFlow: income - expenses,
    transactionCount: monthRows.length,
    needsReview: reviewCount,
  };
}

function duplicateKey(row: BankingSourceRow): string {
  const concept = normalize(row.normalizedConcept || row.originalConcept);
  const account = normalize(row.productOrAccount);
  const amount = row.amount === null ? '' : row.amount.toFixed(2);
  return [row.date, account, amount, concept].join('|');
}

export function findDuplicateCandidates(rows: BankingSourceRow[]): DuplicateCandidate[] {
  const groups = new Map<string, BankingSourceRow[]>();

  for (const row of rows) {
    if (!row.date || row.amount === null) continue;
    const key = duplicateKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, rows: group }));
}

export function getLatestAccountBalances(rows: BankingSourceRow[]): AccountBalanceSnapshot[] {
  const latest = new Map<string, AccountBalanceSnapshot>();

  for (const row of rows) {
    if (row.balance === null || !row.productOrAccount || !row.date) continue;
    const key = row.identifier || row.productOrAccount;
    const current = latest.get(key);

    if (!current || row.date > current.date) {
      latest.set(key, {
        account: row.productOrAccount,
        institution: row.institution,
        identifier: row.identifier,
        balance: row.balance,
        date: row.date,
      });
    }
  }

  return [...latest.values()].sort((a, b) => a.account.localeCompare(b.account, 'es'));
}

export function getNetWorthFromKnownBalances(rows: BankingSourceRow[]): number {
  return getLatestAccountBalances(rows).reduce((total, account) => total + account.balance, 0);
}
