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
  await expect(page.getByLabel("Desde")).toHaveValue("2026-09-01");
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
