import { expect, test, type Page } from "@playwright/test";

async function mockOnboarding(page: Page, state: "new" | "ready") {
  await page.route("**/api/source/google/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        state === "ready"
          ? { configured: true, connection: { connected: true } }
          : { configured: true, connection: null },
      ),
    });
  });

  await page.route("**/api/source/google/sync", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        state === "ready"
          ? { run: { status: "success", rowsFailed: 0, warningsCount: 0, errorCode: null }, cursors: [{}] }
          : { run: null, cursors: [] },
      ),
    });
  });

  await page.route("**/api/configuration", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accounts: state === "ready" ? [{ lifecycle: "active" }, { lifecycle: "active" }] : [] }),
    });
  });

  await page.route("**/api/financial?mode=snapshot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, principles: { bankSource: "read_only" } }),
    });
  });
}

test.describe("Financial App 10.0.67 · activación y divulgación progresiva", () => {
  test("un usuario nuevo ve una sola siguiente acción y no documentación técnica en primer nivel", async ({ page }) => {
    await mockOnboarding(page, "new");
    await page.goto("/onboarding");

    await expect(page.getByRole("heading", { name: "De tus movimientos a una visión clara de tu dinero" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Conecta tus movimientos", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Conectar movimientos", exact: true }).first()).toBeVisible();

    const technical = page.getByText("Qué comprueba Financial App por detrás", { exact: true });
    await expect(technical).toBeVisible();
    await expect(page.getByText("El resumen solo se considera listo", { exact: false })).not.toBeVisible();

    await technical.click();
    await expect(page.getByText("El resumen solo se considera listo", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir diagnósticos de la fuente" })).toBeVisible();
  });

  test("cuando la preparación está completa conduce al beneficio y a las decisiones pendientes", async ({ page }) => {
    await mockOnboarding(page, "ready");
    await page.goto("/onboarding");

    const main = page.locator("main[data-activation-complete]");
    await expect(main).toHaveAttribute("data-activation-complete", "true");
    await expect(page.getByRole("heading", { name: "Empieza por lo que importa hoy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver mi resumen", exact: true })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Ver pendientes", exact: true })).toHaveAttribute("href", "/review");

    await expect(page.getByText("2 cuentas activas están preparadas", { exact: false })).toBeVisible();
    await expect(page.getByText("motor financiero central", { exact: false })).toHaveCount(0);
    await expect(page.getByText("módulos propietarios", { exact: false })).toHaveCount(0);
  });

  test("la ruta de Fuente mantiene el diagnóstico técnico fuera de la acción principal", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "isolated" }) });
    });
    await page.goto("/configuration/source");

    await expect(page.getByRole("heading", { name: "Fuente bancaria" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Detalles técnicos" })).toHaveAttribute("href", "/configuration/source/diagnostics");
  });
});
