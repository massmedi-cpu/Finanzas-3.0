import { isTransfer } from './finance-engine';
import type { BankingSourceRow } from './source-schema';

export interface RecurringPattern {
  key: string;
  description: string;
  category: string;
  averageAmount: number;
  intervalDays: number;
  occurrences: number;
  lastDate: string;
  confidence: number;
  nextExpectedDate?: string;
}

export interface RecurringPreferenceInput {
  pattern_key: string;
  status: 'auto' | 'confirmed' | 'ignored';
  display_name: string | null;
  expected_amount: number | string | null;
  category: string | null;
  next_expected_date: string | null;
}

export type ForecastSource = 'detected' | 'planned';

export interface ForecastMovement {
  id: string;
  description: string;
  category: string;
  expectedDate: string;
  amount: number;
  confidence: number;
  source: ForecastSource;
}

export interface PlannedEventInput {
  id: string;
  title: string;
  expected_date: string;
  amount: number | string;
  category: string | null;
  recurrence: 'once' | 'monthly' | 'yearly';
  recurrence_end: string | null;
  active: boolean;
}

export interface ScenarioInput {
  id: string;
  name: string;
  income_change_pct: number | string;
  expense_change_pct: number | string;
  monthly_net_adjustment: number | string;
  monthly_savings_allocation: number | string;
  starting_balance_adjustment: number | string;
  horizon_months: number | string;
  active: boolean;
}

export interface ScenarioProjection {
  scenarioId: string;
  name: string;
  horizonDate: string;
  projectedBalance: number;
  freeAfterSavings: number;
  baselineBalance: number;
  differenceVsBaseline: number;
  savingsAllocated: number;
}

export interface LiquidityRisk {
  lowestBalance: number;
  lowestDate: string | null;
  firstNegativeDate: string | null;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es-ES')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function toDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = toDate(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function addMonths(value: string, months: number): string {
  const date = toDate(value);
  if (!date) return value;
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return formatDate(date);
}

function addYears(value: string, years: number): string {
  return addMonths(value, years * 12);
}

function daysBetween(a: string, b: string): number {
  const first = toDate(a);
  const second = toDate(b);
  if (!first || !second) return 0;
  return Math.round((second.valueOf() - first.valueOf()) / 86_400_000);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function patternKey(row: BankingSourceRow): string {
  const description = normalize(row.merchantOrCounterparty || row.normalizedConcept || row.originalConcept);
  const direction = (row.amount ?? 0) < 0 ? 'expense' : 'income';
  return `${direction}|${normalize(row.productOrAccount)}|${description}`;
}

export function detectRecurringPatterns(rows: BankingSourceRow[]): RecurringPattern[] {
  const groups = new Map<string, BankingSourceRow[]>();

  for (const row of rows) {
    if (isTransfer(row) || row.amount === null || row.amount === 0 || !row.date) continue;
    const key = patternKey(row);
    if (!key.endsWith('|')) {
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
  }

  const patterns: RecurringPattern[] = [];

  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 3) continue;

    const intervals = sorted.slice(1).map((row, index) => daysBetween(sorted[index].date, row.date)).filter((days) => days > 0);
    const intervalDays = Math.round(median(intervals));
    if (intervalDays < 20 || intervalDays > 40) continue;

    const amounts = sorted.map((row) => row.amount as number);
    const averageAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const typical = Math.max(Math.abs(averageAmount), 1);
    const meanDeviation = amounts.reduce((sum, amount) => sum + Math.abs(amount - averageAmount), 0) / amounts.length;
    const amountStability = Math.max(0, 1 - meanDeviation / typical);
    const intervalDeviation = intervals.reduce((sum, days) => sum + Math.abs(days - intervalDays), 0) / Math.max(intervals.length, 1);
    const intervalStability = Math.max(0, 1 - intervalDeviation / Math.max(intervalDays, 1));
    const confidence = Math.min(0.99, 0.55 + Math.min(sorted.length, 8) * 0.04 + amountStability * 0.2 + intervalStability * 0.1);

    const last = sorted[sorted.length - 1];
    patterns.push({
      key,
      description: last.merchantOrCounterparty || last.normalizedConcept || last.originalConcept,
      category: last.category,
      averageAmount,
      intervalDays,
      occurrences: sorted.length,
      lastDate: last.date,
      confidence,
    });
  }

  return patterns.sort((a, b) => Math.abs(b.averageAmount) - Math.abs(a.averageAmount));
}

export function applyRecurringPreferences(patterns: RecurringPattern[], preferences: RecurringPreferenceInput[]): RecurringPattern[] {
  const byKey = new Map(preferences.map((preference) => [preference.pattern_key, preference]));

  return patterns.flatMap((pattern) => {
    const preference = byKey.get(pattern.key);
    if (preference?.status === 'ignored') return [];

    const expectedAmount = preference?.expected_amount == null ? null : Number(preference.expected_amount);
    return [{
      ...pattern,
      description: preference?.display_name || pattern.description,
      category: preference?.category || pattern.category,
      averageAmount: expectedAmount !== null && Number.isFinite(expectedAmount) ? expectedAmount : pattern.averageAmount,
      nextExpectedDate: preference?.next_expected_date || undefined,
      confidence: preference?.status === 'confirmed' ? Math.max(pattern.confidence, 0.98) : pattern.confidence,
    }];
  });
}

export function buildForecast(patterns: RecurringPattern[], fromDate: string, days = 90): ForecastMovement[] {
  const horizon = addDays(fromDate, days);
  const movements: ForecastMovement[] = [];

  for (const pattern of patterns) {
    let expectedDate = pattern.nextExpectedDate && toDate(pattern.nextExpectedDate)
      ? pattern.nextExpectedDate
      : addDays(pattern.lastDate, pattern.intervalDays);
    while (expectedDate <= fromDate) expectedDate = addDays(expectedDate, pattern.intervalDays);

    let sequence = 0;
    while (expectedDate <= horizon && sequence < 24) {
      movements.push({
        id: `${pattern.key}|${expectedDate}`,
        description: pattern.description,
        category: pattern.category,
        expectedDate,
        amount: pattern.averageAmount,
        confidence: pattern.confidence,
        source: 'detected',
      });
      expectedDate = addDays(expectedDate, pattern.intervalDays);
      sequence += 1;
    }
  }

  return movements.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

export function expandPlannedEvents(events: PlannedEventInput[], fromDate: string, days = 365): ForecastMovement[] {
  const horizon = addDays(fromDate, days);
  const movements: ForecastMovement[] = [];

  for (const event of events) {
    if (!event.active || !toDate(event.expected_date)) continue;
    const amount = Number(event.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;

    let date = event.expected_date;
    const effectiveEnd = event.recurrence_end && event.recurrence_end < horizon ? event.recurrence_end : horizon;

    if (event.recurrence === 'once') {
      if (date > fromDate && date <= horizon) {
        movements.push({
          id: `planned:${event.id}:${date}`,
          description: event.title,
          category: event.category || 'Planificado',
          expectedDate: date,
          amount,
          confidence: 1,
          source: 'planned',
        });
      }
      continue;
    }

    while (date <= fromDate) {
      date = event.recurrence === 'monthly' ? addMonths(date, 1) : addYears(date, 1);
    }

    let sequence = 0;
    while (date <= effectiveEnd && sequence < 72) {
      movements.push({
        id: `planned:${event.id}:${date}`,
        description: event.title,
        category: event.category || 'Planificado',
        expectedDate: date,
        amount,
        confidence: 1,
        source: 'planned',
      });
      date = event.recurrence === 'monthly' ? addMonths(date, 1) : addYears(date, 1);
      sequence += 1;
    }
  }

  return movements.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

function plannedMatchesDetected(planned: ForecastMovement, detected: ForecastMovement): boolean {
  if (planned.source !== 'planned' || detected.source !== 'detected') return false;
  if (Math.abs(daysBetween(planned.expectedDate, detected.expectedDate)) > 3) return false;
  const amountTolerance = Math.max(1, Math.abs(planned.amount) * 0.03);
  if (Math.abs(planned.amount - detected.amount) > amountTolerance) return false;
  const plannedName = normalize(planned.description);
  const detectedName = normalize(detected.description);
  return plannedName === detectedName || plannedName.includes(detectedName) || detectedName.includes(plannedName);
}

export function combineForecasts(detected: ForecastMovement[], planned: ForecastMovement[]): ForecastMovement[] {
  const filteredDetected = detected.filter((candidate) => !planned.some((explicit) => plannedMatchesDetected(explicit, candidate)));
  return [...filteredDetected, ...planned].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate) || a.description.localeCompare(b.description, 'es'));
}

export function projectedNetChange(forecast: ForecastMovement[], throughDate: string): number {
  return forecast
    .filter((movement) => movement.expectedDate <= throughDate)
    .reduce((sum, movement) => sum + movement.amount, 0);
}

export function getLiquidityRisk(forecast: ForecastMovement[], startingBalance: number): LiquidityRisk {
  let runningBalance = startingBalance;
  let lowestBalance = startingBalance;
  let lowestDate: string | null = null;
  let firstNegativeDate: string | null = startingBalance < 0 ? forecast[0]?.expectedDate ?? null : null;

  for (const movement of [...forecast].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))) {
    runningBalance += movement.amount;
    if (runningBalance < lowestBalance) {
      lowestBalance = runningBalance;
      lowestDate = movement.expectedDate;
    }
    if (runningBalance < 0 && !firstNegativeDate) firstNegativeDate = movement.expectedDate;
  }

  return { lowestBalance, lowestDate, firstNegativeDate };
}

export function simulateScenario(
  forecast: ForecastMovement[],
  startingBalance: number,
  fromDate: string,
  scenario: ScenarioInput,
): ScenarioProjection {
  const horizonMonths = Math.min(60, Math.max(1, Math.trunc(Number(scenario.horizon_months) || 12)));
  const horizonDate = addMonths(fromDate, horizonMonths);
  const incomeMultiplier = 1 + (Number(scenario.income_change_pct) || 0) / 100;
  const expenseMultiplier = 1 + (Number(scenario.expense_change_pct) || 0) / 100;
  const startingAdjustment = Number(scenario.starting_balance_adjustment) || 0;
  const monthlyNetAdjustment = Number(scenario.monthly_net_adjustment) || 0;
  const monthlySavings = Math.max(0, Number(scenario.monthly_savings_allocation) || 0);

  const relevant = forecast.filter((movement) => movement.expectedDate <= horizonDate);
  const baselineNet = relevant.reduce((sum, movement) => sum + movement.amount, 0);
  const adjustedNet = relevant.reduce((sum, movement) => {
    if (movement.amount > 0) return sum + movement.amount * incomeMultiplier;
    return sum + movement.amount * expenseMultiplier;
  }, 0) + monthlyNetAdjustment * horizonMonths;

  const baselineBalance = startingBalance + baselineNet;
  const projectedBalance = startingBalance + startingAdjustment + adjustedNet;
  const savingsAllocated = monthlySavings * horizonMonths;

  return {
    scenarioId: scenario.id,
    name: scenario.name,
    horizonDate,
    projectedBalance,
    freeAfterSavings: projectedBalance - savingsAllocated,
    baselineBalance,
    differenceVsBaseline: projectedBalance - baselineBalance,
    savingsAllocated,
  };
}
