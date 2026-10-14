import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isForecastSummaryArithmeticConsistent } from "../../src/application/forecast/forecast-contract";

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
