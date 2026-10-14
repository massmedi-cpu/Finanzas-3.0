import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { areForecastItemsWithinSelection, isForecastSummaryArithmeticConsistent } from "../../src/application/forecast/forecast-contract";

const valid = {
  openingBalanceCents: 105000,
  projectedIncomeCents: 240000,
  projectedExpenseCents: 72500,
  projectedNetCents: 167500,
  projectedClosingBalanceCents: 272500,
};

test("REC-FCAST-054 · forecast net and closing balance must reconcile exactly in cents", () => {
  expect(isForecastSummaryArithmeticConsistent(valid)).toBe(true);
  for (const [field, amount] of [
    ["projectedIncomeCents", 239999],
    ["projectedExpenseCents", 72501],
    ["projectedNetCents", 167499],
    ["projectedClosingBalanceCents", 272501],
    ["openingBalanceCents", 105001],
  ] as const) {
    expect(isForecastSummaryArithmeticConsistent({ ...valid, [field]: amount }), field).toBe(false);
  }
});

test("REC-FCAST-055 · forged negative expense, imprecise cents or overflow are not trustworthy", () => {
  expect(isForecastSummaryArithmeticConsistent({
    ...valid, projectedExpenseCents: -72500,
  })).toBe(false);
  expect(isForecastSummaryArithmeticConsistent({
    ...valid, projectedIncomeCents: 240000.5,
  })).toBe(false);
  expect(isForecastSummaryArithmeticConsistent({
    ...valid, openingBalanceCents: Number.MAX_SAFE_INTEGER,
  })).toBe(false);
  expect(isForecastSummaryArithmeticConsistent(null)).toBe(false);
});

test("REC-FCAST-056 · the API and browser share one arithmetic trust boundary", () => {
  const contract = readFileSync(join(process.cwd(), "src/application/forecast/forecast-contract.ts"), "utf8");
  const api = readFileSync(join(process.cwd(), "app/api/forecast/route.ts"), "utf8");
  const client = readFileSync(join(process.cwd(), "app/forecast/forecast-client.tsx"), "utf8");
  expect(contract).toContain("&& isForecastSummaryArithmeticConsistent(summary)");
  expect(api).toContain("isForecastSnapshotForSelection");
  expect(client).toContain("isForecastSnapshot(data)");
});


test("REC-FCAST-058 · scoped forecasts reject cross-account, duplicate or out-of-range items", () => {
  const accountId = "10000000-0000-4000-8000-000000000001";
  const otherId = "10000000-0000-4000-8000-000000000002";
  const period = { dateFrom: "2026-10-01", dateTo: "2026-10-31", accountId };
  const valid = [
    { id: "81000000-0000-4000-8000-000000000001", date: "2026-10-01", accountId },
    { id: "81000000-0000-4000-8000-000000000002", date: "2026-10-31", accountId },
  ];
  expect(areForecastItemsWithinSelection(valid, period)).toBe(true);
  expect(areForecastItemsWithinSelection(valid, { ...period, accountId: null })).toBe(true);
  expect(areForecastItemsWithinSelection([], period)).toBe(true);
  expect(areForecastItemsWithinSelection([...valid, valid[0]], period)).toBe(false);
  expect(areForecastItemsWithinSelection([{ ...valid[0], accountId: otherId }], period)).toBe(false);
  for (const date of ["2026-09-30", "2026-11-01", "2026-02-30", "not-a-date"]) {
    expect(areForecastItemsWithinSelection([{ ...valid[0], date }], period), date).toBe(false);
  }
  expect(areForecastItemsWithinSelection(null, period)).toBe(false);
});

test("REC-FCAST-059 · the forecast renderer uses the same scoped item invariant", () => {
  const contract = readFileSync(join(process.cwd(), "src/application/forecast/forecast-contract.ts"), "utf8");
  expect(contract).toContain("&& areForecastItemsWithinSelection(snapshot.items, period)");
});
