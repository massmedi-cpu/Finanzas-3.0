import { expect, test } from "@playwright/test";

const STORAGE_KEY = "financial-app:mobile-favorite";

test("móvil permite elegir un acceso favorito local sin guardar datos financieros", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Personalización móvil validada en viewport móvil");

  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "personalization_shell_isolated" }) });
  });
  await page.goto("/");

  const mobileNav = page.getByRole("navigation", { name: "Navegación móvil" });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: "Revisar", exact: true })).toBeVisible();

  await mobileNav.getByRole("button", { name: "Más", exact: true }).click();
  const favorite = page.getByLabel("Acceso favorito");
  await expect(favorite).toBeVisible();
  await expect(page.getByText("Solo se guarda en este dispositivo. No contiene datos financieros.", { exact: true })).toBeVisible();
  await favorite.selectOption("/accounts");

  await expect(mobileNav.getByRole("link", { name: "Cuentas", exact: true })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: "Revisar", exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBe("/accounts");

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Navegación móvil" }).getByRole("link", { name: "Cuentas", exact: true })).toBeVisible();
});
