import { expect, test, type Page, type Route } from "@playwright/test";

const accountId = "10000000-0000-4000-8000-000000000111";
const categoryId = "20000000-0000-4000-8000-000000000111";

function row(id: string, concept: string, bankDate: string) {
  return {
    id,
    bankDate,
    amountCents: -1234,
    balanceAfterCents: 100000,
    account: { id: accountId, name: "Cuenta demo" },
    concept: { original: concept, processed: concept, effective: concept },
    merchant: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
    category: { originalId: categoryId, originalName: "Alimentación", effectiveId: categoryId, effectiveName: "Alimentación" },
    kind: { original: "expense", effective: "expense" },
    reviewState: { original: "confirmed", effective: "confirmed" },
    duplicateState: "none",
    signMismatch: false,
    transferPairId: null,
    excludedFromAnalytics: false,
    userNote: null,
    hasUserOverride: false,
    overriddenFields: [],
    source: {
      sourceRecordId: `70000000-0000-4000-8000-${id.slice(-12)}`,
      sourceRowIdentity: `source::sheet::${id}`,
      sourceFileId: "source-file-demo",
      sourceSheetId: "sheet-demo",
      sourceRowKey: id,
      sourceFingerprint: "a".repeat(64),
      importedAt: "2026-10-03T12:00:00.000Z",
    },
  };
}

const initialRow = row("60000000-0000-4000-8000-000000000111", "INICIAL", "2026-10-03");
const appendedRow = row("60000000-0000-4000-8000-000000000112", "PAGINA ANTIGUA", "2026-10-02");
const slowRow = row("60000000-0000-4000-8000-000000000113", "RESULTADO LENTO", "2026-10-01");
const fastRow = row("60000000-0000-4000-8000-000000000114", "RESULTADO NUEVO", "2026-09-30");

async function fulfillJson(route: Route, payload: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
}

async function mockTransactions(page: Page) {
  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());

    if (url.searchParams.get("mode") === "facets") {
      await fulfillJson(route, {
        accounts: [{ id: accountId, name: "Cuenta demo", lifecycle: "active", sort_order: 0 }],
        categories: [{ id: categoryId, name: "Alimentación", kind: "expense", lifecycle: "active", parent_category_id: null, sort_order: 0 }],
        merchants: [],
      });
      return;
    }

    if (url.searchParams.get("cursorId")) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      await fulfillJson(route, { rows: [appendedRow], totalCount: 2, hasMore: false, nextCursor: null });
      return;
    }

    const query = url.searchParams.get("q");
    if (query === "slow") {
      await new Promise((resolve) => setTimeout(resolve, 650));
      await fulfillJson(route, { rows: [slowRow], totalCount: 1, hasMore: false, nextCursor: null });
      return;
    }
    if (query === "fast") {
      await fulfillJson(route, { rows: [fastRow], totalCount: 1, hasMore: false, nextCursor: null });
      return;
    }

    await fulfillJson(route, {
      rows: [initialRow],
      totalCount: 2,
      hasMore: true,
      nextCursor: { bankDate: initialRow.bankDate, id: initialRow.id },
    });
  });
}

test("la respuesta lenta de un filtro anterior no puede sobrescribir el filtro más reciente", async ({ page }) => {
  await mockTransactions(page);
  await page.goto("/transactions");
  await expect(page.getByText("INICIAL", { exact: true }).first()).toBeVisible();

  const slowRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/transactions" && url.searchParams.get("q") === "slow";
  });
  await page.getByLabel("Buscar", { exact: true }).fill("slow");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await slowRequest;

  const fastRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/transactions" && url.searchParams.get("q") === "fast";
  });
  await page.getByLabel("Buscar", { exact: true }).fill("fast");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await fastRequest;

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("RESULTADO LENTO", { exact: true })).toHaveCount(0);
});

test("una paginación antigua no puede anexarse después de aplicar un filtro nuevo", async ({ page }) => {
  await mockTransactions(page);
  await page.goto("/transactions");
  await expect(page.getByText("INICIAL", { exact: true }).first()).toBeVisible();

  const appendRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/transactions" && url.searchParams.has("cursorId");
  });
  await page.getByRole("button", { name: "Cargar 50 más" }).click();
  await appendRequest;

  const fastRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/transactions" && url.searchParams.get("q") === "fast";
  });
  await page.getByLabel("Buscar", { exact: true }).fill("fast");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await fastRequest;

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PAGINA ANTIGUA", { exact: true })).toHaveCount(0);
  await expect(page.getByText("INICIAL", { exact: true })).toHaveCount(0);
});
