import type { CashFlowEvolutionPoint } from "./cash-flow-model";

export type CashFlowEvolutionSeries =
  | "realCumulativeCents"
  | "plannedCumulativeCents"
  | "combinedCumulativeCents";

const ONE_DAY_MS = 86_400_000;

function dayNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const millis = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 10) !== date) return null;
  return millis;
}

function adjacentDays(first: string, second: string): boolean {
  const a = dayNumber(first);
  const b = dayNumber(second);
  return a !== null && b !== null && b - a === ONE_DAY_MS;
}

/** A missing or skipped day breaks the path; no interpolation across unknown observations. */
export function cashFlowSegmentedPath(
  points: CashFlowEvolutionPoint[],
  key: CashFlowEvolutionSeries,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let previous: number | null = null;
  const commands: string[] = [];
  points.forEach((point, index) => {
    const value = point[key];
    if (value === null || !Number.isSafeInteger(value)) {
      previous = null;
      return;
    }
    const continuous = previous !== null && adjacentDays(points[previous].date, point.date);
    commands.push(`${continuous ? "L" : "M"} ${x(index)} ${y(value)}`);
    previous = index;
  });
  return commands.join(" ");
}

/** A single known day still needs a visible mark even without a line segment. */
export function cashFlowIsolatedPoints(
  points: CashFlowEvolutionPoint[],
  key: CashFlowEvolutionSeries,
): number[] {
  return points.flatMap((point, index) => {
    if (point[key] === null || !Number.isSafeInteger(point[key])) return [];
    const prev = points[index - 1];
    const next = points[index + 1];
    const before = prev?.[key] !== null && prev?.[key] !== undefined && adjacentDays(prev.date, point.date);
    const after = next?.[key] !== null && next?.[key] !== undefined && adjacentDays(point.date, next.date);
    return !before && !after ? [index] : [];
  });
}

/** Use actual calendar time, not array position, for horizontal spacing. */
export function cashFlowDayPositions(points: CashFlowEvolutionPoint[]): number[] {
  const days = points.map((point) => dayNumber(point.date));
  const first = days[0] ?? null;
  const last = days.at(-1) ?? null;
  if (first !== null && last !== null && last > first
    && days.every((day, index) => day !== null && (index === 0 || day > (days[index - 1] ?? Infinity)))) {
    return days.map((day) => ((day ?? first) - first) / (last - first));
  }
  return points.map((_, index) => points.length <= 1 ? 0.5 : index / (points.length - 1));
}
