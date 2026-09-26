import { expect, test, type Page, type Route } from "@playwright/test";

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-11",
    incomeCents: 120000,
    expenseCents: 60000,
    operatingNetCents: 60000,
    savingsCents: 60000,
    savingsRateBps: 5000,
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-11",
    activeBalanceCents: 300000,
    accounts: [
      { id: "a", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 300000, explicitBalanceDate: "2026-09-11" },
    ],
  },
};

const monthly = {
  dateFrom: "2026-08-01",
  dateTo: "2026-09-11",
  rows: [
    { monthStart: "2026-08-01", incomeCents: 120000, expenseCents: 50000, operatingNetCents: 70000 },
    { monthStart: "2026-09-01", incomeCents: 120000, expenseCents: 60000, operatingNetCents: 60000 },
  ],
};

const budgets = {
  month: "2026-09",
  total: { categoryId: null, categoryName: null, effectiveAmountCents: 100000, actualExpenseCents: 60000, remainingCents: 40000, progressBps: 6000, status: "on_track" },
  categories: [],
};

const forecast = {
  summary: { projectedIncomeCents: 0, projectedExpenseCents: 0, projectedNetCents: 0, projectedClosingBalanceCents: 300000, plannedItems: 0 },
  items: [],
};

const transactions = {
  totalCount: 10,
  rows: [
    {
      id: "t1",
      bankDate: "2026-09-11",
      amountCents: -1200,
      account: { id: "a", name: "Cuenta principal" },
      concept: { effective: "Compra" },
      merchant: { effectiveName: "Comercio" },
      category: { effectiveName: "Compras" },
      kind: { effective: "expense" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
};

type SyncMode = "missing-after-sync" | "duplicates-persisted";

async function mockInicio(page: Page, mode: SyncMode) {
  let posts = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/source/google/sync") {
      if (request.method() === "POST") {
        posts += 1;
        await json(route, mode === "missing-after-sync"
          ? { status: "success", rowsInserted: 0, rowsRevised: 0, rowsSkipped: 10, rowsMissing: 1, duplicatesDetected: 0, warningsCount: 1 }
          : { status: "success", rowsInserted: 0, rowsRevised: 0, rowsSkipped: 10, rowsMissing: 0, duplicatesDetected: 2, warningsCount: 0 });
        return;
      }

      const warned = mode === "duplicates-persisted" || posts > 0;
      await json(route, {
        run: {
          id: "run-warning",
          status: "success",
          startedAt: "2026-09-15T09:04:08.000Z",
          finishedAt: "2026-09-15T09:04:08.000Z",
          rowsSeen: 10,
          rowsInserted: 0,
          rowsRevised: 0,
          rowsSkipped: 10,
          rowsFailed: 0,
          duplicatesDetected: warned && mode === "duplicates-persisted" ? 2 : 0,
          warningsCount: warned && mode === "missing-after-sync" ? 1 : 0,
          errorCode: null,
          errorMessage: null,
        },
        cursors: [],
      });
      return;
    }

    if (url.pathname === "/api/dashboard") {
      if (url.searchParams.get("scope") === "primary") {
        await json(route, {
          contractVersion: 1,
          scope: "primary",
          asOfDate: "2026-09-11",
          dataThroughDate: "2026-09-11",
          generatedAt: "2026-09-15T09:04:08.000Z",
          requestedSources: ["financial", "transactions"],
          failedSources: [],
          data: { financial, monthly: null, budgets: null, forecast: null, transactions },
        });
        return;
      }
      await json(route, {
        contractVersion: 1,
        scope: "secondary",
        asOfDate: "2026-09-11",
        dataThroughDate: "2026-09-11",
        generatedAt: "2026-09-15T09:04:08.000Z",
        requestedSources: ["monthly", "budgets", "forecast"],
        failedSources: [],
        data: { financial: null, monthly, budgets, forecast, transactions: null },
      });
      return;
    }

    await route.fallback();
  });
  return () => posts;
}

test("Actualizar datos no llama «sin cambios» a una sincronización con filas desaparecidas", async ({ page }) => {
  const postCount = await mockInicio(page, "missing-after-sync");
  await page.goto("/");

  await page.getByRole("button", { name: "Actualizar datos" }).click();
  await expect.poll(postCount).toBe(1);
  await expect(page.getByText("Sincronización completada con avisos", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin cambios incorporados. 1 movimiento importado anteriormente ya no aparece en la fuente. Revisa la fuente.", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin cambios nuevos.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("La última sincronización tiene avisos", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Sincronización completada con avisos", { exact: true })).toBeVisible();
  await expect(page.getByText("1 aviso de sincronización requiere revisión. Revisa la fuente.", { exact: true })).toBeVisible();
});

test("Inicio conserva tras recarga los posibles duplicados de la última sincronización", async ({ page }) => {
  await mockInicio(page, "duplicates-persisted");
  await page.goto("/");

  await expect(page.getByText("Sincronización completada con avisos", { exact: true })).toBeVisible();
  await expect(page.getByText("2 posibles duplicados detectados. Revisa la fuente.", { exact: true })).toBeVisible();
  await expect(page.getByText("La última sincronización tiene avisos", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar fuente" })).toBeVisible();
});
