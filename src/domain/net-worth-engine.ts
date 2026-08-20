import type { BankingSourceRow } from './source-schema';

export interface NetWorthPoint {
  month: string;
  netWorth: number;
  accountCount: number;
  change: number | null;
  changePct: number | null;
}

interface AccountBalance {
  balance: number;
  date: string;
}

function monthEnd(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return `${yearMonth}-31`;
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

function accountKey(row: BankingSourceRow): string {
  return row.identifier?.trim() || row.productOrAccount.trim();
}

export function getBalanceMonths(rows: BankingSourceRow[]): string[] {
  return [...new Set(
    rows
      .filter((row) => row.balance !== null && row.date && accountKey(row))
      .map((row) => row.date.slice(0, 7))
      .filter((month) => /^\d{4}-\d{2}$/.test(month)),
  )].sort((a, b) => a.localeCompare(b));
}

export function getNetWorthHistory(rows: BankingSourceRow[], limit = 24): NetWorthPoint[] {
  const months = getBalanceMonths(rows);
  const selectedMonths = limit > 0 ? months.slice(-limit) : months;
  if (!selectedMonths.length) return [];

  const relevant = rows
    .filter((row) => row.balance !== null && row.date && accountKey(row))
    .sort((a, b) => a.date.localeCompare(b.date));

  const latest = new Map<string, AccountBalance>();
  const points: NetWorthPoint[] = [];
  let pointer = 0;
  let previous: number | null = null;

  for (const month of selectedMonths) {
    const end = monthEnd(month);
    while (pointer < relevant.length && relevant[pointer].date <= end) {
      const row = relevant[pointer];
      const key = accountKey(row);
      const current = latest.get(key);
      if (!current || row.date >= current.date) {
        latest.set(key, { balance: row.balance as number, date: row.date });
      }
      pointer += 1;
    }

    const netWorth = [...latest.values()].reduce((sum, account) => sum + account.balance, 0);
    const change = previous === null ? null : netWorth - previous;
    const changePct = previous === null || previous === 0 ? null : (change as number / Math.abs(previous)) * 100;
    points.push({ month, netWorth, accountCount: latest.size, change, changePct });
    previous = netWorth;
  }

  return points;
}

export function getLatestNetWorthPoint(rows: BankingSourceRow[]): NetWorthPoint | null {
  return getNetWorthHistory(rows, 1)[0] ?? null;
}
