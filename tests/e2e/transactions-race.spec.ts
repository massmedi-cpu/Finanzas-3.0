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

  const search = page.getByLabel("Buscar", { exact: true });
  await search.fill("antigua");
  const slowStarted = page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "antigua");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await slowStarted;

  await search.fill("nueva");
  const fastStarted = page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "nueva");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await fastStarted;

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 movimiento", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(350);

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("RESULTADO ANTIGUO", { exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
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

  await page.getByLabel("Buscar", { exact: true }).fill("nueva");
  const filteredStarted = page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "nueva");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await filteredStarted;

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(350);

  await expect(page.getByText("RESULTADO NUEVO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PÁGINA ANTIGUA", { exact: true })).toHaveCount(0);
  await expect(page.getByText("RESULTADO INICIAL", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 movimiento", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cargar 50 más" })).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("REC-TXN-001 · HTTP 200 sin filas verificables no se presenta como extracto vacío y permite relectura", async ({ page }) => {
  let reads = 0;
  const writes: string[] = [];
  await page.route("**/api/transactions**", async (route) => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().method());
      await route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
      return;
    }
    if (new URL(route.request().url()).searchParams.get("mode") === "facets") {
      await fulfillFacets(route);
      return;
    }
    reads += 1;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(reads === 1 ? { rows: null, totalCount: 0, hasMore: false } :
        { rows: [baseRow], totalCount: 1, hasMore: false, nextCursor: null }),
    });
  });

  await page.goto("/transactions");
  await expect(page.locator("main").getByRole("alert")).toContainText("La respuesta del histórico es incompleta");
  await expect(page.getByText("El listado todavía no se ha podido verificar. No se considera vacío.")).toBeVisible();
  await expect(page.getByLabel("Resumen del listado").locator("div").first().locator("strong")).toHaveText("—");
  await expect(page.getByText("Histórico sin verificar", { exact: true })).toBeVisible();
  await expect(page.getByText("No hay movimientos que coincidan con los filtros actuales.")).toHaveCount(0);
  await page.getByRole("button", { name: "Reintentar listado" }).click();
  await expect(page.getByText("RESULTADO INICIAL", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Resumen del listado").locator("div").first().locator("strong")).toHaveText("1");
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(reads).toBe(2);
  expect(writes).toEqual([]);
});

test("REC-TXN-002 · una página incoherente no elimina los movimientos previamente cargados", async ({ page }) => {
  let continuationReads = 0;
  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "facets") {
      await fulfillFacets(route);
      return;
    }
    if (url.searchParams.has("cursorId")) {
      continuationReads += 1;
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(continuationReads === 1
          ? { rows: [stalePageRow], totalCount: 2, hasMore: true, nextCursor: null }
          : { rows: [stalePageRow], totalCount: 2, hasMore: false, nextCursor: null }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        rows: [baseRow], totalCount: 2, hasMore: true,
        nextCursor: { bankDate: baseRow.bankDate, id: baseRow.id },
      }),
    });
  });
  await page.goto("/transactions");
  await expect(page.getByText("RESULTADO INICIAL", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Cargar 50 más" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("La respuesta del histórico es incompleta");
  await expect(page.getByText("RESULTADO INICIAL", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PÁGINA ANTIGUA", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cargar 50 más" }).click();
  await expect(page.getByText("PÁGINA ANTIGUA", { exact: true }).first()).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(continuationReads).toBe(2);
});

test("REC-TXN-003 · el fallo de facetas no invalida la lista y el reintento solo lee", async ({ page }) => {
  let facetReads = 0;
  let listReads = 0;
  const mutations: string[] = [];
  await page.route("**/api/transactions**", async (route) => {
    if (route.request().method() !== "GET") {
      mutations.push(route.request().method());
      await route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
      return;
    }
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "facets") {
      facetReads += 1;
      if (facetReads === 1) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "facets_timeout" }) });
      } else {
        await fulfillFacets(route);
      }
      return;
    }
    listReads += 1;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ rows: [baseRow], totalCount: 1, hasMore: false, nextCursor: null }),
    });
  });
  await page.goto("/transactions");
  await expect(page.getByText("RESULTADO INICIAL", { exact: true }).first()).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toContainText("No se han podido verificar las cuentas y categorías");
  await page.getByRole("button", { name: "Reintentar cuentas y categorías" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("account-filter")).toContainText("Cuenta de prueba");
  await expect(page.getByText("RESULTADO INICIAL", { exact: true }).first()).toBeVisible();
  expect(facetReads).toBe(2);
  expect(listReads).toBe(1);
  expect(mutations).toEqual([]);
});

test("REC-TXN-009 · un filtro inválido no convierte un extracto vacío bien leído en histórico sin verificar", async ({ page }) => {
  await page.route("**/api/transactions**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") === "facets") {
      await fulfillFacets(route);
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ rows: [], totalCount: 0, hasMore: false, nextCursor: null }),
    });
  });
  await page.goto("/transactions");
  await expect(page.getByText("0 movimientos", { exact: true }).first()).toBeVisible();
  await page.locator('input[type="date"]').nth(0).fill("2026-10-20");
  await page.locator('input[type="date"]').nth(1).fill("2026-10-01");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("La fecha inicial no puede ser posterior");
  await expect(page.getByLabel("Resumen del listado").locator("div").first().locator("strong")).toHaveText("0");
  await expect(page.getByText("Histórico sin verificar", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No hay movimientos que coincidan con los filtros actuales.")).toBeVisible();
});
