import { expect, test } from "@playwright/test";

test("Presupuestos mantiene estado de carga accesible durante una recuperación cliente", async ({ page }) => {
  await page.route("**/api/budgets*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "persistence_failed", code: "temporary_test" }),
    });
  });

  await page.goto("/budgets");
  await expect(page.getByText(/Cargando presupuesto de/i)).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("No se pudo completar la operación de presupuestos");
});
