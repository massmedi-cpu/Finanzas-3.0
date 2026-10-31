import type { ForecastSnapshot } from "./forecast-contract";

export type ForecastTimelinePoint = {
  id: string;
  label: string;
  date: string;
  balanceCents: number;
  eventCount: number;
  kind: "opening" | "day" | "closing";
};

const DAY_MS = 86_400_000;

function dateMillis(raw: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const millis = Date.parse(`${raw}T00:00:00Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === raw ? millis : null;
}

/** The chart must consume engine balances, never recompute projected amounts. */
export function buildForecastTimeline(snapshot: ForecastSnapshot): {
  points: ForecastTimelinePoint[];
  closingReconciled: boolean;
  position: (date: string) => number;
} | null {
  const start = dateMillis(snapshot.period.dateFrom);
  const end = dateMillis(snapshot.period.dateTo);
  if (start === null || end === null || end < start
    || !Number.isSafeInteger(snapshot.summary.openingBalanceCents)
    || !Number.isSafeInteger(snapshot.summary.projectedClosingBalanceCents)) return null;

  const points: ForecastTimelinePoint[] = [{
    id: "opening", label: "Saldo inicial", date: snapshot.period.dateFrom,
    balanceCents: snapshot.summary.openingBalanceCents, eventCount: 0, kind: "opening",
  }];
  let lastMillis = start;
  for (const item of snapshot.items) {
    const current = dateMillis(item.date);
    if (current === null || current < start || current > end || current < lastMillis
      || !Number.isSafeInteger(item.projectedBalanceAfterCents)) return null;
    const previous = points.at(-1);
    if (previous?.kind === "day" && previous.date === item.date) {
      // End-of-day value is the final engine value; all events remain in the detail table.
      previous.balanceCents = item.projectedBalanceAfterCents;
      previous.eventCount += 1;
      previous.label = `${previous.eventCount} eventos · cierre del día`;
    } else {
      points.push({ id: `day-${item.date}`, label: item.concept, date: item.date,
        balanceCents: item.projectedBalanceAfterCents, eventCount: 1, kind: "day" });
    }
    lastMillis = current;
  }

  const lastBalance = points.at(-1)?.balanceCents ?? snapshot.summary.openingBalanceCents;
  const closingReconciled = lastBalance === snapshot.summary.projectedClosingBalanceCents;
  if (closingReconciled && lastMillis < end) {
    points.push({ id: "closing", label: "Fin del periodo", date: snapshot.period.dateTo,
      balanceCents: lastBalance, eventCount: 0, kind: "closing" });
  }
  const duration = Math.max(DAY_MS, end - start);
  return {
    points, closingReconciled,
    position: (date) => {
      const millis = dateMillis(date);
      if (millis === null) return 50;
      return 5 + ((millis - start) / duration) * 90;
    },
  };
}
