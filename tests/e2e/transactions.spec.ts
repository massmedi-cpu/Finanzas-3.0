import { expect, test } from "@playwright/test";

const accountId = "10000000-0000-4000-8000-000000000111";
const categoryId = "20000000-0000-4000-8000-000000000111";
const merchantId = "30000000-0000-4000-8000-000000000111";
const firstId = "60000000-0000-4000-8000-000000000111";
const secondId = "60000000-0000-4000-8000-000000000112";

const firstRow = {
  id: firstId,
  bankDate: "2026-09-05",
  amountCents: -1234,
  balanceAfterCents: 188796,
  account: { id: accountId, name: "Cuenta corriente Openbank · 3967" },
  concept: {
    original: "TPV SUPERMERCADO ORIGINAL",
    processed: "TPV SUPERMERCADO ORIGINAL",
    effective: "Compra supermercado corregida",
  },
  merchant: {
    originalId: null,
    originalName: null,
    effectiveId: merchantId,
    effectiveName: "Supermercado Demo",
  },
  category: {
    originalId: null,
    originalName: null,
    effectiveId: categoryId,
    effectiveName: "Alimentación",
  },
  kind: { original: "expense", effective: "expense" },
  reviewState: { original: "pending", effective: "confirmed" },
  duplicateState: "none",
  transferPairId: null,
  excludedFromAnalytics: false,
  userNote: "Compra revisada",
  hasUserOverride: true,
  overriddenFields: ["concept", "merchant", "category", "reviewState", "note"],
  source: {
    sourceRecordId: "70000000-0000-4000-8000-000000000111",
    sourceRowIdentity: "source::sheet::CC-03021",
    sourceFileId: "source-file-demo",
    sourceSheetId: "725351515",
    sourceRowKey: "CC-03021",
    sourceFingerprint: "a".repeat(64),
    importedAt: "2026-09-05T12:40:29.519Z",
  },
};

const secondRow = {
  ...firstRow,
  id: secondId,
  bankDate: "2026-09-04",
  amountCents: 200000,
  concept: {
    original: "NOMINA SEPTIEMBRE",
    processed: "NOMINA SEPTIEMBRE",
    effective: "NOMINA SEPTIEMBRE",
  },
  merchant: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
  category: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
  kind: { original: "income", effective: "income" },
  reviewState: { original: "pending", effective: "pending" },
  hasUserOverride: false,
  overriddenFields: [],
  userNote: null,
  source: {
    ...firstRow.source,
    sourceRecordId: "70000000-0000-4000-8000-000000000112",
    sourceRowIdentity: "source::sheet::CC-03020",
    sourceRowKey: "CC-03020",
    sourceFingerprint: "b".repeat(64),
  },
};

async function mockTransactionApi(page: import("@playwright/test").Page) {
  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accounts: [{ id: accountId, name: "Cuenta corriente Openbank · 3967", lifecycle: "active", sort_order: 0 }],
          categories: [{ id: categoryId, name: "Alimentación", kind: "expense", lifecycle: "active", parent_category_id: null, sort_order: 0 }],
          merchants: [{ id: merchantId, name: "Supermercado Demo", lifecycle: "active" }],
        }),
      });
      return;
    }

    const cursor = url.searchParams.get("cursorId");
    if (cursor) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rows: [secondRow], totalCount: 2, hasMore: false, nextCursor: null }),
      });
      return;
    }

    const accountFilter = url.searchParams.get("accountId");
    const query = url.searchParams.get("q");
    const filtered = Boolean(accountFilter || query);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rows: [firstRow],
        totalCount: filtered ? 1 : 2,
        hasMore: !filtered,
        nextCursor: filtered ? null : { bankDate: firstRow.bankDate, id: firstRow.id },
      }),
    });
  });
}

test("Movimientos muestra valores efectivos, formato español y trazabilidad sin romper responsive", async ({ page }) => {
  await mockTransactionApi(page);
  await page.goto("/transactions");

  await expect(page.getByRole("heading", { name: "Movimientos", level: 1 })).toBeVisible();
  const firstTransaction = page.locator("tbody tr").first();
  await expect(firstTransaction.getByText("Compra supermercado corregida", { exact: true }).first()).toBeVisible();
  await expect(firstTransaction.getByText("-12,34 €", { exact: true })).toBeVisible();
  await expect(firstTransaction.getByText("Modificado", { exact: true })).toBeVisible();
  await expect(firstTransaction.getByText("Alimentación", { exact: true }).first()).toBeVisible();

  const trace = firstTransaction.locator("details");
  await trace.locator("summary").click();
  await expect(trace.getByText("TPV SUPERMERCADO ORIGINAL", { exact: true }).first()).toBeVisible();
  await expect(trace.getByText("CC-03021", { exact: true })).toBeVisible();
  await expect(trace.getByText("Compra revisada", { exact: true })).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(horizontalOverflow).toBe(false);

  const controlsTooSmall = await page.locator("main button, main input, main select, main summary, main a").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.height < 44;
    }).length,
  );
  expect(controlsTooSmall).toBe(0);
});

test("Movimientos aplica filtros y pagina con cursor estable sin duplicar filas", async ({ page }) => {
  await mockTransactionApi(page);
  await page.goto("/transactions");

  const transactionRows = page.locator("tbody tr");
  await expect(page.getByText("1 de 2", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Cargar 50 más" }).click();
  await expect(transactionRows).toHaveCount(2);
  await expect(transactionRows.nth(1).getByText("NOMINA SEPTIEMBRE", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("2 movimientos", { exact: true }).first()).toBeVisible();
  await expect(transactionRows.first().locator("strong").filter({ hasText: /^Compra supermercado corregida$/ })).toHaveCount(1);

  await page.getByLabel("Cuenta").selectOption(accountId);
  await page.getByLabel("Buscar").fill("supermercado");
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/transactions" && url.searchParams.get("accountId") === accountId && url.searchParams.get("q") === "supermercado";
  });
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await requestPromise;
  await expect(transactionRows).toHaveCount(1);
  await expect(page.getByText("1 movimientos", { exact: true }).first()).toBeVisible();
  const summary = page.getByLabel("Resumen del listado");
  await expect(summary.locator("div").nth(0).getByText("1", { exact: true })).toBeVisible();
  await expect(summary.locator("div").nth(1).getByText("2", { exact: true })).toBeVisible();
  await expect(summary.locator("div").nth(2).getByText("1", { exact: true })).toBeVisible();
});

test("Preview protegido real expone el histórico persistido de Fase 4", async ({ request }) => {
  test.skip(!process.env.VERCEL_PREVIEW_URL, "Gate live: solo se ejecuta contra el preview protegido.");

  const response = await request.get("/api/transactions?limit=1");
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.totalCount).toBeGreaterThanOrEqual(3172);
  expect(Array.isArray(payload.rows)).toBe(true);
  expect(payload.rows).toHaveLength(1);
  expect(payload.rows[0]?.source?.sourceRecordId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(payload.rows[0]?.account?.name).toBeTruthy();
  expect(typeof payload.rows[0]?.amountCents).toBe("number");
});
