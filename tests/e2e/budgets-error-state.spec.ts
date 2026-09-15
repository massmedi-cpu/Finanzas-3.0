import { expect, test } from "@playwright/test";

test("error de persistencia se presenta sin datos inventados", async ({ page }) => {
  await page.route("**/api/budgets*", async (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "persistence_failed", code: "test_unavailable" }),
  }));
  await page.goto("/budgets");
  await expect(page.getByRole("alert")).toContainText("No se pudo completar la operación de presupuestos");
  await expect(page.getByLabel("Resumen del presupuesto mensual")).toHaveCount(0);
});
