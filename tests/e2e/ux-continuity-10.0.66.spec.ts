import { expect, test } from "@playwright/test";

test.describe("Financial App 10.0.66 · continuidad UX", () => {
  test("el error de acceso se anuncia, recibe foco y queda asociado a las credenciales", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "invalid_credentials" }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("persona@example.com");
    await page.getByLabel("Contraseña").fill("credencial-no-valida");
    await page.getByRole("button", { name: "Entrar" }).click();

    const alert = page.locator("#login-error");
    await expect(alert).toHaveRole("alert");
    await expect(alert).toHaveText("Correo o contraseña incorrectos.");
    await expect(alert).toBeFocused();

    for (const field of [page.getByLabel("Correo electrónico"), page.getByLabel("Contraseña")]) {
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(field).toHaveAttribute("aria-describedby", "login-error");
    }
  });

  test("un fallo temporal de acceso no acusa a las credenciales", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "authentication_unavailable" }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("persona@example.com");
    await page.getByLabel("Contraseña").fill("cualquier-valor");
    await page.getByRole("button", { name: "Entrar" }).click();

    const alert = page.locator("#login-error");
    await expect(alert).toHaveRole("alert");
    await expect(alert).toHaveText("El acceso seguro no está disponible temporalmente.");
    await expect(alert).toBeFocused();
    await expect(page.getByLabel("Correo electrónico")).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Contraseña")).not.toHaveAttribute("aria-invalid", "true");
  });
});
