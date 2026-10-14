import { expect, test } from "@playwright/test";
import { GET } from "../../app/api/dashboard/route";
import {
  HOME_SCOPE_SOURCES,
  isDashboardEnvelopeForScope,
  type HomeDashboardScope,
} from "../../src/application/dashboard/dashboard-envelope-integrity";

const emptyData = () => ({
  financial: null, monthly: null, budgets: null, forecast: null, transactions: null,
});

function envelope(scope: HomeDashboardScope = "critical") {
  const data = emptyData();
  for (const source of HOME_SCOPE_SOURCES[scope]) {
    (data as Record<string, unknown>)[source] = { validSource: source };
  }
  return {
    contractVersion: 1,
    scope,
    asOfDate: "2026-10-14",
    dataThroughDate: "2026-10-13",
    generatedAt: "2026-10-14T07:20:00.000Z",
    requestedSources: [...HOME_SCOPE_SOURCES[scope]],
    failedSources: [] as string[],
    data,
  };
}

test("REC-HOME-SCOPE-001 · every correctly scoped dashboard snapshot retains source identity", () => {
  for (const scope of Object.keys(HOME_SCOPE_SOURCES) as HomeDashboardScope[]) {
    expect(isDashboardEnvelopeForScope(envelope(scope), scope), scope).toBe(true);
  }
});

test("REC-HOME-SCOPE-002 · no HTTP 200 may substitute a different banking scope", () => {
  for (const scope of Object.keys(HOME_SCOPE_SOURCES) as HomeDashboardScope[]) {
    for (const other of Object.keys(HOME_SCOPE_SOURCES) as HomeDashboardScope[]) {
      if (other !== scope) expect(isDashboardEnvelopeForScope(envelope(other), scope), `${other} as ${scope}`).toBe(false);
    }
  }
});

test("REC-HOME-SCOPE-003 · failed and unrequested source totals never contaminate Inicio", () => {
  const wrong = envelope("critical");
  wrong.data.transactions = { forgedTotal: 99999 } as never;
  expect(isDashboardEnvelopeForScope(wrong, "critical")).toBe(false);
  const failure = envelope("secondary");
  failure.failedSources = ["monthly"];
  expect(isDashboardEnvelopeForScope(failure, "secondary")).toBe(false);
  failure.data.monthly = null;
  expect(isDashboardEnvelopeForScope(failure, "secondary")).toBe(true);
  failure.failedSources = ["monthly", "monthly"];
  expect(isDashboardEnvelopeForScope(failure, "secondary")).toBe(false);
});

test("REC-HOME-SCOPE-004 · reject altered payload lists, missing data and invalid dates", () => {
  const baseline = envelope("primary");
  expect(isDashboardEnvelopeForScope({ ...baseline, requestedSources: ["financial", "financial"] }, "primary")).toBe(false);
  expect(isDashboardEnvelopeForScope({ ...baseline, requestedSources: ["transactions", "financial"] }, "primary")).toBe(false);
  expect(isDashboardEnvelopeForScope({ ...baseline, data: { financial: baseline.data.financial } }, "primary")).toBe(false);
  expect(isDashboardEnvelopeForScope({ ...baseline, asOfDate: "2026-02-30" }, "primary")).toBe(false);
  expect(isDashboardEnvelopeForScope({ ...baseline, generatedAt: "not-a-time" }, "primary")).toBe(false);
  expect(isDashboardEnvelopeForScope({ ...baseline, data: { ...baseline.data, expenses: { amount: 999999 } } }, "primary")).toBe(false);
});

test("REC-HOME-SCOPE-005 · ambiguous dashboard selectors fail before opening private gateway", async () => {
  for (const url of [
    "https://test.local/api/dashboard?scope=critical&scope=activity",
    "https://test.local/api/dashboard?scope=critical&scope=critical",
    "https://test.local/api/dashboard?scope=critical&accountId=elsewhere",
    "https://test.local/api/dashboard?unexpected=1",
  ]) {
    const response = await GET(new Request(url));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request", code: "invalid_dashboard_parameters",
    });
  }
});
