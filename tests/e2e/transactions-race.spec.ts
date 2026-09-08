import { expect, test } from "@playwright/test";

const accountId = "10000000-0000-4000-8000-000000000191";
const baseId = "60000000-0000-4000-8000-000000000191";
const slowId = "60000000-0000-4000-8000-000000000192";
const fastId = "60000000-0000-4000-8000-000000000193";
const stalePageId = "60000000-0000-4000-8000-000000000194";

function transactionRow(id: string, concept: string, bankDate = "2026-09-08") {
  return {
    id,
    bankDate,
    amountCents: -1000,
    balanceAfterCents: 100000,
    account: { id: accountId, name: "Cuenta de prueba" },
    concept: { original: concept, processed: concept, effective: concept },
    merchant: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
    category: { originalId: null, originalName: null, effectiveId: null, effectiveName: null },
    kind: { original: "expense", effective: "expense" },
    reviewState: { original: "confirmed", effective: "confirmed" },
    duplicateState: "none",
    transferPairId: null,
    excludedFromAnalytics: false,
    userNote: null,
    hasUserOverride: false,
    overriddenFields: [],
    source: {
      sourceRecordId: `70000000-0000-4000-8000-${id.slice(-12)}`,
      sourceRowIdentity: `race::${id}`,
      sourceFileId: "race-source",
      sourceSheetId: "race-sheet",
      sourceRowKey: id,
      sourceFingerprint: "c".repeat(64),
      importedAt: "2026-09-08T04:00:00.000Z",
    },
  };
}

const baseRow = transactionRow(baseId, "RESULTADO INICIAL", "2026-09-08");
const slowRow = transactionRow(slowId, "RESULTADO ANTIGUO", "2026-09-07");
const fastRow = transactionRow(fastId, "RESULTADO NUEVO", "2026-09-06");
const stalePageRow = transactionRow(stalePageId, "PÁGINA ANTIGUA", "2026-09-05");

async function fulfillFacets(route: import("@playwright/test").Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      accounts: [{ id: accountId, name: "Cuenta de prueba", lifecycle: "active", sort_order: 0 }],
      categories: [],
      merchants: [],
    }),
  });
}

test("Movimientos conserva el filtro más nuevo aunque una petición anterior termine después", async ({ page }) => {
  await page.route("**/api/transactions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.searchParams.get("mode") === "facets") {
      await fulfillFacets(route);
      return;
    }

    const query = url.searchParams.get("q");
    if (query === "antigua") {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "internal_error", code: "stale_request_must_not_surface" }),
      });
      return;
    }
    if (query === "nueva") {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rows: [fastRow], totalCount: 1, hasMore: false, nextCursor: null }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows: [baseRow], totalCount: 1, hasMore: false, nextCursor: null }),
    });
  });

  await page.goto("/transactions");
  await expect(page.getByText("RESULTADO INICIAL", { exact: true }).first()).toBeVisible();

  const search = page.getByLabel("Buscar");
  await search.fill("antigua");
  const slowStarted = page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "antigua");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await slowStarted;

  await search.fill("nueva");
  const fastStarted = page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "nueva");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await fastStarted;

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 movimientos", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(350);

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("RESULTADO ANTIGUO", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Leyendo movimientos persistidos…", { exact: true })).toHaveCount(0);
});

test("Movimientos ignora una paginación antigua si se aplica un filtro nuevo mientras carga", async ({ page }) => {
  await page.route("**/api/transactions**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.searchParams.get("mode") === "facets") {
      await fulfillFacets(route);
      return;
    }

    if (url.searchParams.get("cursorId")) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rows: [stalePageRow], totalCount: 2, hasMore: false, nextCursor: null }),
      });
      return;
    }

    if (url.searchParams.get("q") === "nueva") {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rows: [fastRow], totalCount: 1, hasMore: false, nextCursor: null }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rows: [baseRow],
        totalCount: 2,
        hasMore: true,
        nextCursor: { bankDate: baseRow.bankDate, id: baseRow.id },
      }),
    });
  });

  await page.goto("/transactions");
  await expect(page.getByText("1 de 2", { exact: true }).first()).toBeVisible();

  const paginationStarted = page.waitForRequest((request) => new URL(request.url()).searchParams.has("cursorId"));
  await page.getByRole("button", { name: "Cargar 50 más" }).click();
  await paginationStarted;

  await page.getByLabel("Buscar").fill("nueva");
  const filteredStarted = page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "nueva");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await filteredStarted;

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(350);

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PÁGINA ANTIGUA", { exact: true })).toHaveCount(0);
  await expect(page.getByText("RESULTADO INICIAL", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 movimientos", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cargar 50 más" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
