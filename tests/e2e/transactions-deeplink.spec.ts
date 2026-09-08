import { expect, test } from "@playwright/test";

async function mockTransactions(page: import("@playwright/test").Page, seen: URL[]) {
  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "facets") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accounts: [], categories: [], merchants: [] }),
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
