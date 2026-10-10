import { expect, test } from "@playwright/test";
import { cashFlowDayPositions, cashFlowIsolatedPoints, cashFlowSegmentedPath } from "../../src/application/cash-flow/evolution-plot";
import { cashFlowObservedDaySignal, type CashFlowEvolutionPoint, type CashFlowTransaction } from "../../src/application/cash-flow/cash-flow-model";

function point(date: string, value: number | null): CashFlowEvolutionPoint {
  return { date, realCumulativeCents: value, plannedCumulativeCents: null, combinedCumulativeCents: null };
}

test("chart disconnects missing calendar days instead of inventing continuity", () => {
  const rows = [point("2026-10-01", 100), point("2026-10-02", null), point("2026-10-03", 200), point("2026-10-04", 300), point("2026-10-07", 400)];
  const path = cashFlowSegmentedPath(rows, "realCumulativeCents", i => i * 10, v => v);
  expect(path).toBe("M 0 100 M 20 200 L 30 300 M 40 400");
  expect(cashFlowIsolatedPoints(rows, "realCumulativeCents")).toEqual([0, 4]);
});

test("chart preserves genuine zero without confusing it with missing coverage", () => {
  const rows = [point("2026-10-01", 0), point("2026-10-02", 0), point("2026-10-03", null)];
  expect(cashFlowSegmentedPath(rows, "realCumulativeCents", i => i * 10, v => v)).toBe("M 0 0 L 10 0");
  expect(cashFlowIsolatedPoints(rows, "realCumulativeCents")).toEqual([]);
  expect(cashFlowSegmentedPath(rows, "plannedCumulativeCents", () => 0, () => 0)).toBe("");
});

test("chart spaces unequal dates by calendar duration and does not join the gap", () => {
  const rows = [point("2026-10-01", 100), point("2026-10-03", 200), point("2026-10-04", 300)];
  expect(cashFlowDayPositions(rows)).toEqual([0, 2 / 3, 1]);
  expect(cashFlowSegmentedPath(rows, "realCumulativeCents", i => i * 10, v => v)).toBe("M 0 100 M 10 200 L 20 300");
});

test("one observed day remains visible as an isolated point", () => {
  const rows = [point("2026-10-15", -250)];
  expect(cashFlowDayPositions(rows)).toEqual([0.5]);
  expect(cashFlowIsolatedPoints(rows, "realCumulativeCents")).toEqual([0]);
  expect(cashFlowSegmentedPath(rows, "realCumulativeCents", () => 50, v => v)).toBe("M 50 -250");
});

test("Cash Flow calendar hides bank signals without confirmed coverage and excludes transfers/duplicates", () => {
  const income: CashFlowTransaction = {
    id: "synthetic-income", bankDate: "2026-10-01", amountCents: 12050,
    account: { id: "synthetic-account", name: "Fictitious account" },
    concept: { effective: "Fixture income" },
    kind: { effective: "income" }, duplicateState: "none", excludedFromAnalytics: false,
  };
  const expense: CashFlowTransaction = {
    ...income, id: "synthetic-expense", amountCents: -3450,
    kind: { effective: "expense" },
  };
  const covered = { real: [income, expense] };
  expect(cashFlowObservedDaySignal(covered, false, "income")).toBe(false);
  expect(cashFlowObservedDaySignal(covered, false, "expense")).toBe(false);
  expect(cashFlowObservedDaySignal(covered, true, "income")).toBe(true);
  expect(cashFlowObservedDaySignal(covered, true, "expense")).toBe(true);

  // A positive internal transfer or confirmed duplicate is not an income.
  const ineligible = { real: [
    { ...income, id: "synthetic-transfer", kind: { effective: "transfer" as const } },
    { ...income, id: "synthetic-duplicate", duplicateState: "confirmed" as const },
    { ...expense, id: "synthetic-excluded", excludedFromAnalytics: true },
  ] };
  expect(cashFlowObservedDaySignal(ineligible, true, "income")).toBe(false);
  expect(cashFlowObservedDaySignal(ineligible, true, "expense")).toBe(false);
});
