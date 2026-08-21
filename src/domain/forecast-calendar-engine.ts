import { addMonths, type ForecastMovement } from './forecast-engine';

export interface ForecastCalendarMonth {
  month: string;
  income: number;
  expenses: number;
  netCashFlow: number;
  startingBalance: number;
  endingBalance: number;
  lowestBalance: number;
  firstNegativeDate: string | null;
  movementCount: number;
  plannedCount: number;
}

export interface ForecastYearSummary {
  year: string;
  income: number;
  expenses: number;
  netCashFlow: number;
  startingBalance: number;
  endingBalance: number;
  lowestBalance: number;
  firstNegativeDate: string | null;
  movementCount: number;
  plannedCount: number;
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return `${month}-31`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0, 12)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

export function buildForecastCalendar(
  forecast: ForecastMovement[],
  startingBalance: number,
  fromDate: string,
  months = 12,
): ForecastCalendarMonth[] {
  const safeMonths = Math.max(1, Math.min(60, Math.trunc(months) || 12));
  const monthKeys = Array.from({ length: safeMonths }, (_, index) => addMonths(fromDate, index).slice(0, 7));
  const allowed = new Set(monthKeys);
  const movements = [...forecast]
    .filter((movement) => movement.expectedDate > fromDate && allowed.has(movement.expectedDate.slice(0, 7)))
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate) || a.id.localeCompare(b.id));

  let runningBalance = Number.isFinite(startingBalance) ? startingBalance : 0;
  let pointer = 0;
  const rows: ForecastCalendarMonth[] = [];

  for (const month of monthKeys) {
    const startingMonthBalance = runningBalance;
    let income = 0;
    let expenses = 0;
    let movementCount = 0;
    let plannedCount = 0;
    let lowestBalance = runningBalance;
    let firstNegativeDate: string | null = runningBalance < 0
      ? (month === fromDate.slice(0, 7) ? fromDate : `${month}-01`)
      : null;
    const end = monthEnd(month);

    while (pointer < movements.length && movements[pointer].expectedDate <= end) {
      const movement = movements[pointer];
      if (movement.expectedDate.slice(0, 7) !== month) {
        pointer += 1;
        continue;
      }
      if (movement.amount > 0) income += movement.amount;
      if (movement.amount < 0) expenses += Math.abs(movement.amount);
      runningBalance += movement.amount;
      movementCount += 1;
      if (movement.source === 'planned') plannedCount += 1;
      if (runningBalance < lowestBalance) lowestBalance = runningBalance;
      if (runningBalance < 0 && !firstNegativeDate) firstNegativeDate = movement.expectedDate;
      pointer += 1;
    }

    rows.push({
      month,
      income,
      expenses,
      netCashFlow: income - expenses,
      startingBalance: startingMonthBalance,
      endingBalance: runningBalance,
      lowestBalance,
      firstNegativeDate,
      movementCount,
      plannedCount,
    });
  }

  return rows;
}

export function buildForecastYearlyOutlook(
  forecast: ForecastMovement[],
  startingBalance: number,
  fromDate: string,
  horizonDate: string,
): ForecastYearSummary[] {
  const startYear = Number(fromDate.slice(0, 4));
  const endYear = Number(horizonDate.slice(0, 4));
  if (!startYear || !endYear || endYear < startYear) return [];

  const movements = [...forecast]
    .filter((movement) => movement.expectedDate > fromDate && movement.expectedDate <= horizonDate)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate) || a.id.localeCompare(b.id));

  let runningBalance = Number.isFinite(startingBalance) ? startingBalance : 0;
  let pointer = 0;
  const rows: ForecastYearSummary[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const yearKey = String(year);
    const startingYearBalance = runningBalance;
    let income = 0;
    let expenses = 0;
    let movementCount = 0;
    let plannedCount = 0;
    let lowestBalance = runningBalance;
    let firstNegativeDate: string | null = runningBalance < 0
      ? (yearKey === fromDate.slice(0, 4) ? fromDate : `${yearKey}-01-01`)
      : null;

    while (pointer < movements.length && movements[pointer].expectedDate.slice(0, 4) === yearKey) {
      const movement = movements[pointer];
      if (movement.amount > 0) income += movement.amount;
      if (movement.amount < 0) expenses += Math.abs(movement.amount);
      runningBalance += movement.amount;
      movementCount += 1;
      if (movement.source === 'planned') plannedCount += 1;
      if (runningBalance < lowestBalance) lowestBalance = runningBalance;
      if (runningBalance < 0 && !firstNegativeDate) firstNegativeDate = movement.expectedDate;
      pointer += 1;
    }

    rows.push({
      year: yearKey,
      income,
      expenses,
      netCashFlow: income - expenses,
      startingBalance: startingYearBalance,
      endingBalance: runningBalance,
      lowestBalance,
      firstNegativeDate,
      movementCount,
      plannedCount,
    });
  }

  return rows;
}
