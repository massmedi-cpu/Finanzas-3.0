import { expect, test } from "@playwright/test";
import { getHomeExpenseAverageCoverage, isHomeExpenseAverageVerified } from "../../src/application/dashboard/home-expense-average-evidence";
import type { HomeBankFreshness } from "../../src/application/dashboard/home-bank-coverage";

const completedSync = {
  status: "success",
  startedAt: "2026-09-11T07:58:00Z",
  finishedAt: "2026-09-11T08:00:00Z",
  rowsSeen: 100, rowsFailed: 0, rowsMissing: 0,
  duplicatesDetected: 0, warningsCount: 0,
};

const goodSource: HomeBankFreshness = {
  available: true,
  earliestMovementDate: "2026-01-01",
  latestMovementDate: "2026-09-11",
  sync: completedSync,
};
const request = {
  periodEnd: "2026-08-31",
  months: 3,
  freshness: goodSource,
  activityLatestDate: "2026-09-11",
};

test("REC-HOME-AVG-001 · expense average requires completed banking evidence for the entire three-month interval", () => {
  const coverage = getHomeExpenseAverageCoverage(request);
  expect(coverage?.state).toBe("covered");
  expect(isHomeExpenseAverageVerified(request)).toBe(true);
  expect(isHomeExpenseAverageVerified({ ...request, months: 2 })).toBe(true);
});

test("REC-HOME-AVG-002 · recorded months before first imported bank date never certify an average", () => {
  const freshness: HomeBankFreshness = {
    ...goodSource, earliestMovementDate: "2026-08-01",
  };
  const input = { ...request, freshness };
  expect(getHomeExpenseAverageCoverage(input)?.state).toBe("partial");
  expect(isHomeExpenseAverageVerified(input)).toBe(false);
});

test("REC-HOME-AVG-003 · unknown source bounds, unfinished or incident-laden imports fail closed", () => {
  const sources: Array<HomeBankFreshness | null> = [
    null,
    { ...goodSource, available: false },
    { ...goodSource, earliestMovementDate: null },
    { ...goodSource, sync: null },
    { ...goodSource, sync: { ...completedSync, status: "started" } },
    { ...goodSource, sync: { ...completedSync, rowsMissing: 1 } },
  ];
  for (const freshness of sources) {
    expect(isHomeExpenseAverageVerified({ ...request, freshness })).toBe(false);
  }
  expect(isHomeExpenseAverageVerified({ ...request, activityLatestDate: "2026-09-10" })).toBe(false);
});

test("REC-HOME-AVG-004 · malformed period and month counts cannot certify historical figures", () => {
  for (const periodEnd of ["2026-02-30", "2026-13-31", "2026/08/31", ""]) {
    expect(isHomeExpenseAverageVerified({ ...request, periodEnd })).toBe(false);
  }
  for (const months of [-1, 0, 4, 1.5, Number.NaN]) {
    expect(isHomeExpenseAverageVerified({ ...request, months })).toBe(false);
  }
});
