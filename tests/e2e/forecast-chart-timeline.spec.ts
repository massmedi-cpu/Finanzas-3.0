import { expect, test } from "@playwright/test";
import { buildForecastTimeline } from "../../src/application/forecast/forecast-chart-timeline";
import type { ForecastItem, ForecastSnapshot } from "../../src/application/forecast/forecast-contract";

const item = (date: string, value: number, id = date) =>
  ({ id, date, concept: id, projectedBalanceAfterCents: value } as ForecastItem);

function forecast(items: ForecastItem[], closing = items.at(-1)?.projectedBalanceAfterCents ?? 1000): ForecastSnapshot {
  return {
    period: { dateFrom: "2026-10-01", dateTo: "2026-10-31" },
    summary: { openingBalanceCents: 1000, projectedClosingBalanceCents: closing },
    items,
  } as ForecastSnapshot;
}

test("forecast x-axis measures elapsed days instead of equally spaced transactions", () => {
  const model = buildForecastTimeline(forecast([item("2026-10-02", 900), item("2026-10-29", 1300)]));
  expect(model?.position("2026-10-01")).toBe(5);
  expect(model?.position("2026-10-02")).toBe(8);
  expect(model?.position("2026-10-29")).toBe(89);
  expect(model?.position("2026-10-31")).toBe(95);
  expect(model?.points.at(-1)).toMatchObject({ date: "2026-10-31", balanceCents: 1300 });
});

test("forecast groups same-day events without changing original engine balances", () => {
  const items = [item("2026-10-15", -100, "a"), item("2026-10-15", 1100, "b")];
  const model = buildForecastTimeline(forecast(items));
  expect(model?.points).toHaveLength(3);
  expect(model?.points[1]).toMatchObject({ eventCount: 2, balanceCents: 1100 });
  expect(items.map(i => i.projectedBalanceAfterCents)).toEqual([-100, 1100]);
});

test("forecast never fabricates closing line for mismatched engine balance", () => {
  const model = buildForecastTimeline(forecast([item("2026-10-10", 700)], 900));
  expect(model?.closingReconciled).toBe(false);
  expect(model?.points.at(-1)?.date).toBe("2026-10-10");
});

test("forecast rejects reversed dates, out-of-range dates and invalid money", () => {
  expect(buildForecastTimeline(forecast([item("2026-10-25", 500), item("2026-10-10", 200)]))).toBeNull();
  expect(buildForecastTimeline(forecast([item("2026-11-01", 500)]))).toBeNull();
  expect(buildForecastTimeline(forecast([item("2026-10-08", Number.NaN)]))).toBeNull();
});

test("forecast with no events spans the actual period with an unchanged balance", () => {
  expect(buildForecastTimeline(forecast([]))?.points.map(p => p.kind)).toEqual(["opening", "closing"]);
});
