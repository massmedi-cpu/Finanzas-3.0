import { expect, test } from "@playwright/test";

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const MERCHANT_ID = "22222222-2222-4222-8222-222222222222";

async function mockTransactions(page: import("@playwright/test").Page, seen: URL[]) {
  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accounts: [],
          categories: [{ id: CATEGORY_ID, name: "Alimentación", kind: "expense", lifecycle: "active", parent_category_id: null, sort_order: 0 }],
          merchants: [{ id: MERCHANT_ID, name: "Mercado Central", lifecycle: "active" }],
        }),
      });
      return;
    }

    seen.push(url);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows: [], totalCount: 0, hasMore: false, nextCursor: null }),
    });
  });
}

test("E1 · los deep-links de revisión aplican realmente el filtro propietario en Movimientos", async ({ page }) => {
  const seen: URL[] = [];
  await mockTransactions(page, seen);

  await page.goto("/transactions?reviewState=needs_review");
  await expect(page.getByRole("button", { name: /Ocultar filtros avanzados/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Revisión" })).toHaveValue("needs_review");
  await expect.poll(() => seen.some((url) => url.searchParams.get("reviewState") === "needs_review")).toBe(true);

  seen.length = 0;
  await page.goto("/transactions?duplicateState=suspected");
  await expect(page.getByRole("combobox", { name: "Duplicados" })).toHaveValue("suspected");
  await expect.poll(() => seen.some((url) => url.searchParams.get("duplicateState") === "suspected")).toBe(true);
});

test("E2 · los drill-downs de Análisis aplican periodo, tipo, categoría y comercio en Movimientos", async ({ page }) => {
  const seen: URL[] = [];
  await mockTransactions(page, seen);

  await page.goto(`/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&kind=expense&categoryId=${CATEGORY_ID}`);
  await expect(page.getByRole("combobox", { name: "Tipo" })).toHaveValue("expense");
  await expect(page.getByRole("combobox", { name: "Categoría" })).toHaveValue(CATEGORY_ID);
  await expect(page.getByLabel("Desde", { exact: true })).toHaveValue("2026-09-01");
  await expect(page.getByLabel("Hasta")).toHaveValue("2026-09-30");
  await expect.poll(() => seen.some((url) =>
    url.searchParams.get("dateFrom") === "2026-09-01" &&
    url.searchParams.get("dateTo") === "2026-09-30" &&
    url.searchParams.get("kind") === "expense" &&
    url.searchParams.get("categoryId") === CATEGORY_ID,
  )).toBe(true);

  seen.length = 0;
  await page.goto(`/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&kind=expense&merchantId=${MERCHANT_ID}`);
  await expect(page.getByRole("combobox", { name: "Comercio" })).toHaveValue(MERCHANT_ID);
  await expect.poll(() => seen.some((url) => url.searchParams.get("merchantId") === MERCHANT_ID)).toBe(true);

  seen.length = 0;
  await page.goto("/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&kind=expense&categoryId=__uncategorized__");
  await expect(page.getByRole("combobox", { name: "Categoría" })).toHaveValue("__uncategorized__");
  await expect.poll(() => seen.some((url) => url.searchParams.get("uncategorized") === "true")).toBe(true);
});

test("10.0.21 · búsqueda y sin categoría desde Análisis conservan el filtro real", async ({ page }) => {
  const seen: URL[] = [];
  await mockTransactions(page, seen);
  await page.goto('/transactions?uncategorized=true&q=caf%C3%A9&kind=expense');
  await expect(page.getByLabel('Buscar', { exact: true })).toHaveValue('café');
  await expect(page.getByTestId('category-filter')).toHaveValue('__uncategorized__');
  await expect.poll(() => seen.some(url => url.searchParams.get('q') === 'café' && url.searchParams.get('uncategorized') === 'true')).toBe(true);
});

test("10.0.21 · filtros sobreviven recarga, atrás y navegación rápida", async ({ page }) => {
  const seen: URL[] = [];
  await mockTransactions(page, seen);
  await page.goto('/transactions');
  await expect(page.getByText('0 movimientos', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Buscar', { exact: true }).fill('supermercado');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page).toHaveURL(/q=supermercado/);
  await page.reload();
  await expect(page.getByLabel('Buscar', { exact: true })).toHaveValue('supermercado');
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await page.goBack();
  await expect(page.getByLabel('Buscar', { exact: true })).toHaveValue('supermercado');
  await page.getByRole('navigation', { name: 'Filtros rápidos de movimientos' }).getByRole('link', { name: 'Gastos', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Tipo', exact: true })).toHaveValue('expense');
  await expect(page.getByLabel('Buscar', { exact: true })).toHaveValue('supermercado');
  await expect.poll(() => seen.at(-1)?.searchParams.get('kind')).toBe('expense');
  await expect.poll(() => seen.at(-1)?.searchParams.get('q')).toBe('supermercado');
});

test("AUD-E2E-NAV-001 · Gastos conserva fecha, comercio y búsqueda hasta limpiar explícitamente", async ({ page }) => {
  const seen: URL[] = [];
  await mockTransactions(page, seen);
  await page.goto("/transactions?dateFrom=2026-09-25&dateTo=2026-09-25&merchantId=" + MERCHANT_ID + "&q=Mercadona");
  const nav = page.getByRole("navigation", { name: "Filtros rápidos de movimientos" });
  const gastos = nav.getByRole("link", { name: "Gastos", exact: true });
  await gastos.click();
  await expect.poll(() => {
    const params = new URL(page.url()).searchParams;
    return ["dateFrom", "dateTo", "merchantId", "q", "kind"].map((k) => params.get(k));
  }).toEqual(["2026-09-25", "2026-09-25", MERCHANT_ID, "Mercadona", "expense"]);
  await expect(nav.getByRole("link", { name: "Gastos", exact: true })).toHaveAttribute("aria-current", "page");
  await expect.poll(() => seen.some((url) => url.searchParams.get("merchantId") === MERCHANT_ID && url.searchParams.get("kind") === "expense")).toBe(true);
  await nav.getByRole("link", { name: "Todos", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions$/);
});


test("AUD-E2E-MOV-001 · Más filtros no cambia la consulta ni pierde borradores", async ({ page }) => {
  const seen: URL[] = [];
  await mockTransactions(page, seen);
  await page.goto("/transactions?dateFrom=2026-09-01&dateTo=2026-09-30&kind=expense");
  await expect(page.getByLabel("Buscar", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Desde", { exact: true })).toHaveValue("2026-09-01");
  await expect(page.getByRole("combobox", { name: "Tipo" })).toHaveValue("expense");
  const more = page.getByRole("button", { name: "Más filtros" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  const queryCount = seen.length;
  await more.click();
  await expect(page.getByLabel("Comercio")).toBeVisible();
  await page.getByLabel("Comercio").selectOption(MERCHANT_ID);
  await expect(page.getByRole("button", { name: /Ocultar filtros avanzados/ })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: /Ocultar filtros avanzados/ }).click();
  await expect(page.getByLabel("Comercio")).toBeHidden();
  expect(seen.length).toBe(queryCount);
  await page.getByRole("button", { name: /Más filtros/ }).click();
  await expect(page.getByLabel("Comercio")).toHaveValue(MERCHANT_ID);
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect.poll(() => seen.some((url) =>
    url.searchParams.get("merchantId") === MERCHANT_ID
    && url.searchParams.get("dateFrom") === "2026-09-01"
    && url.searchParams.get("kind") === "expense"
  )).toBe(true);
});
