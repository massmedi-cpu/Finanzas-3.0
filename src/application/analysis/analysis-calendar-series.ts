import type { AnalysisDailySpend } from "./analysis-engine";

export type AnalysisCalendarDay = AnalysisDailySpend & {
  hasActivity: boolean;
};

export type AnalysisAccumulatedDay = AnalysisCalendarDay & {
  accumulatedCents: number;
};

const DAY_MS = 86_400_000;

function parseIsoDay(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildDailySpendCalendar(
  rows: readonly AnalysisDailySpend[],
  dateFrom: string,
  dateTo: string,
): AnalysisCalendarDay[] {
  const start = parseIsoDay(dateFrom);
  const end = parseIsoDay(dateTo);
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const byDate = new Map<string, AnalysisDailySpend>();
  for (const row of rows) {
    const current = byDate.get(row.date);
    byDate.set(row.date, current
      ? {
          date: row.date,
          expenseCents: current.expenseCents + row.expenseCents,
          rows: current.rows + row.rows,
        }
      : { ...row });
  }

  const totalDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const row = byDate.get(key);
    return {
      date: key,
      expenseCents: row?.expenseCents ?? 0,
      rows: row?.rows ?? 0,
      hasActivity: Boolean(row && row.rows > 0),
    };
  });
}

export function buildAccumulatedDailySpend(
  rows: readonly AnalysisDailySpend[],
  dateFrom: string,
  dateTo: string,
): AnalysisAccumulatedDay[] {
  let accumulatedCents = 0;
  return buildDailySpendCalendar(rows, dateFrom, dateTo).map((row) => {
    accumulatedCents += row.expenseCents;
    return { ...row, accumulatedCents };
  });
}
