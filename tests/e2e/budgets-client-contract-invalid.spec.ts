import { expect, test } from "@playwright/test";

test("cliente de Presupuestos rechaza un snapshot incompatible", async ({ page }) => {
  await page.route("**/api/budgets*", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ contractVersion: 99, month: "2026-09" }),
  }));
  await page.goto("/budgets");
  await expect(page.getByRole("alert")).toContainText("incompatible");
});
