import { expect, test } from "@playwright/test";

test("una ruta inexistente muestra una 404 propia, útil y en español", async ({ page }) => {
  const response = await page.goto("/esta-ruta-no-existe-audit");
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Esta página no existe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver a Inicio" })).toHaveAttribute("href", "/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});
