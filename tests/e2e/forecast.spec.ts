import { expect, test } from "@playwright/test";
import { handleForecastLogicAction } from "../../supabase/functions/financial-app-db-gateway/forecast-logic";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const forecastItemId = "81000000-0000-4000-8000-000000000081";
const transactionId = "82000000-0000-4000-8000-000000000082";

const baseSnapshot = {
  contractVersion: 1,
  period: { dateFrom: "2026-09-07", dateTo: "2026-12-06", accountId: null },
  summary: {
    openingBalanceCents: 18884599,
    projectedIncomeCents: 150000,
    projectedExpenseCents: 7250,
    projectedNetCents: 142750,
    projectedClosingBalanceCents: 19027349,
    plannedItems: 1,
    excludedItems: 0,
    confirmedItems: 0,
  },
  items: [
    {
      id: forecastItemId,
      date: "2026-09-15",
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: null,
      merchantId: null,
      merchantName: null,
      concept: "Seguro mensual",
      amountCents: -7250,
      origin: "manual",
      confidence: "high",
      recurrenceId: null,
      budgetId: null,
      confirmedTransactionId: null,
      excluded: false,
      excludedReason: "",
      reconciliationNote: "",
      projectionKey: null,
      status: "planned",
      affectsProjection: true,
      projectionEffectCents: -7250,
      projectedBalanceAfterCents: 18877349,
      actual: null,
    },
  ],
  budgetContext: [
    { month: "2026-09", budgetCents: 128633, actualExpenseCents: 6611, remainingCents: 122022, status: "on_track" },
  ],
  balanceContext: {
    quality: { accounts: 2, integrityDeltaAccounts: 1, explicitBalanceAccounts: 2, reconstructedBalanceAccounts: 0 },
    accounts: [],
  },
  principles: {
    bankSource: "read_only",
    openingBalanceSource: "financial_account_balances",
    recurrenceSource: "active_recurrences_only",
    budgetsCreateDatedItems: false,
    excludedItemsAffectCashFlow: false,
    confirmedItemsAffectCashFlow: false,
    getHasSideEffects: false,
  },
};

const candidates = {
  forecastItemId,
  forecastDate: "2026-09-15",
  forecastAmountCents: -7250,
  days: 7,
  candidates: [
    {
      transactionId,
      date: "2026-09-14",
      amountCents: -7300,
      differenceCents: 50,
      dayDifference: 1,
      accountId: "10000000-0000-4000-8000-000000000001",
      categoryId: null,
      merchantId: null,
      concept: "SEGURO REAL",
    },
  ],
};

async function mockForecastApi(
  page: import("@playwright/test").Page,
  writes: Array<Record<string, unknown>>,
) {
  let current = structuredClone(baseSnapshot);

  await page.route("**/api/forecast*", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());

    if (method === "GET" && url.searchParams.has("itemId")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(candidates) });
      return;
    }

    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
      return;
    }

    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({ method, ...body });

    if (method === "POST" && body.action === "refresh") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated: 0, superseded: 0 }) });
      return;
    }

    if (method === "POST" && body.action === "manual") {
      const id = "81000000-0000-4000-8000-000000000099";
      current = {
        ...current,
        summary: { ...current.summary, plannedItems: current.summary.plannedItems + 1 },
        items: [
          ...current.items,
          {
            ...current.items[0],
            id,
            date: body.date as string,
            concept: body.concept as string,
            amountCents: body.amountCents as number,
          },
        ],
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id, origin: "manual" }) });
      return;
    }

    if (method === "PATCH" && body.action === "exclude") {
      current = {
        ...current,
        items: current.items.map((item) => item.id === body.id ? {
          ...item,
          excluded: body.excluded as boolean,
          excludedReason: body.reason as string,
          status: body.excluded ? "excluded" : "planned",
          affectsProjection: !body.excluded,
        } : item),
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: body.id, excluded: body.excluded }) });
      return;
    }

    if (method === "PATCH" && body.action === "reconcile") {
      current = {
        ...current,
        items: current.items.map((item) => item.id === body.id ? {
          ...item,
          confirmedTransactionId: body.transactionId as string | null,
          status: body.transactionId ? "confirmed" : "planned",
          affectsProjection: body.transactionId ? false : true,
          actual: body.transactionId ? {
            date: "2026-09-14",
            amountCents: -7300,
            accountId: "10000000-0000-4000-8000-000000000001",
            categoryId: null,
            merchantId: null,
            analyticsEligible: true,
          } : null,
        } : item),
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: body.id, confirmed_transaction_id: body.transactionId }) });
      return;
    }

    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_action" }) });
  });
}

test("forecast API rejects invalid inputs before persistence", async ({ request }) => {
  const invalidDate = await request.get("/api/forecast?dateFrom=2026-02-30&dateTo=2026-03-10");
  expect(invalidDate.status()).toBe(400);
  await expect(invalidDate.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_forecast_date_from" });

  const invalidCandidateLimit = await request.get(`/api/forecast?itemId=${forecastItemId}&limit=21`);
  expect(invalidCandidateLimit.status()).toBe(400);
  await expect(invalidCandidateLimit.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_forecast_candidate_limit" });

  const invalidManual = await request.post("/api/forecast", {
    data: { action: "manual", date: "2026-09-10", concept: "", amountCents: -100, confidence: "high" },
  });
  expect(invalidManual.status()).toBe(400);
  await expect(invalidManual.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_forecast_concept" });

  const missingReason = await request.patch("/api/forecast", {
    data: { action: "exclude", id: forecastItemId, excluded: true, reason: "" },
  });
  expect(missingReason.status()).toBe(400);
  await expect(missingReason.json()).resolves.toEqual({ error: "invalid_request", code: "invalid_forecast_excluded_reason" });
});

test("forecast gateway validates payloads before SQL", async () => {
  const sql = () => { throw new Error("sql_should_not_run"); };

  await expect(handleForecastLogicAction({
    action: "forecast.snapshot",
    payload: { dateFrom: "2026-02-30", dateTo: "2026-03-01", accountId: null },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_forecast_date_from");

  await expect(handleForecastLogicAction({
    action: "forecast.manual",
    payload: { date: "2026-09-10", concept: "ok", amountCents: 1.5, confidence: "high" },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_forecast_amount");

  await expect(handleForecastLogicAction({
    action: "forecast.candidates",
    payload: { id: forecastItemId, days: 32, limit: 8 },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_forecast_candidate_days");

  await expect(handleForecastLogicAction({
    action: "forecast.exclude",
    payload: { id: forecastItemId, excluded: "yes", reason: "x" },
    sql,
    environment: "preview",
  })).rejects.toThrow("invalid_forecast_excluded");
});

test("forecast UI renders server cash flow and sends manual expense in cents", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockForecastApi(page, writes);
  await page.goto("/forecast");

  await expect(page.getByRole("heading", { name: "Previsión" })).toBeVisible();
  await expect(page.getByText("188.845,99 €")).toBeVisible();
  await expect(page.getByText("Seguro mensual")).toBeVisible();
  await expect(page.getByText("Presupuesto · contexto", { exact: false })).toBeVisible();

  await page.getByLabel("Concepto").fill("Seguro anual");
  await page.getByLabel("Importe").fill("12,34");
  await page.getByRole("button", { name: "Añadir al calendario" }).click();

  await expect.poll(() => writes.find((entry) => entry.action === "manual")?.amountCents).toBe(-1234);
  await expect(page.getByText("Seguro anual")).toBeVisible();
});

test("forecast UI requires exclusion reason and reconciles from real candidates", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await mockForecastApi(page, writes);
  await page.goto("/forecast");

  await page.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Indica el motivo antes de excluir un elemento previsto.", { exact: true })).toBeVisible();

  await page.getByLabel("Motivo para excluir Seguro mensual").fill("Ya no se espera este cargo");
  await page.getByRole("button", { name: "Excluir" }).click();
  await expect.poll(() => writes.some((entry) => entry.action === "exclude" && entry.reason === "Ya no se espera este cargo")).toBe(true);

  await page.getByRole("button", { name: "Restaurar" }).click();
  await page.getByRole("button", { name: "Buscar movimiento real" }).click();
  await expect(page.getByText("SEGURO REAL")).toBeVisible();
  await page.getByRole("button", { name: "Conciliar" }).click();
  await expect.poll(() => writes.some((entry) => entry.action === "reconcile" && entry.transactionId === transactionId)).toBe(true);
});

test("protected preview exposes exact phase 8 build and real forecast contract", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  const build = await request.get("/api/build");
  expect(build.status()).toBe(200);
  const buildJson = await build.json();
  expect(buildJson.phase).toBe(8);
  expect(buildJson.phaseName).toBe("Previsión");
  if (process.env.GITHUB_SHA) expect(buildJson.commit).toBe(process.env.GITHUB_SHA);

  const snapshot = await request.get("/api/forecast?dateFrom=2026-09-07&dateTo=2026-12-31");
  expect(snapshot.status()).toBe(200);
  const body = await snapshot.json();
  expect(body.contractVersion).toBe(1);
  expect(body.principles.bankSource).toBe("read_only");
  expect(body.principles.getHasSideEffects).toBe(false);
  expect(body.principles.budgetsCreateDatedItems).toBe(false);
  expect(Array.isArray(body.items)).toBe(true);
  expect(Number.isSafeInteger(body.summary.openingBalanceCents)).toBe(true);
  expect(Number.isSafeInteger(body.summary.projectedClosingBalanceCents)).toBe(true);
});
