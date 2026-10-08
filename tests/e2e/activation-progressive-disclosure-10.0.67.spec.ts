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

  await page.route("**/api/financial**", async (route) => {
    const balance = new URL(route.request().url()).searchParams.get("mode") === "balance_series";
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(balance
        ? { rows: [{ monthStart: "2026-09-01", asOfDate: "2026-09-16", accounts: 1, balanceCents: 150000, explicitBalanceAccounts: 1, reconstructedBalanceAccounts: 0 }],
            principles: { bankSource: "read_only", balanceSource: "financial_account_balances", cashFlowReconstruction: false, getHasSideEffects: false } }
        : { contractVersion: 1, principles: { bankSource: "read_only" } }),
    });
  });
  await page.route("**/api/dashboard?scope=all", async (route) => {
    await route.fulfill({
      status: state === "ready" ? 200 : 503, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        failedSources: [],
        data: { financial: {}, transactions: {}, monthly: { rows: [] }, budgets: {}, forecast: {} },
      }),
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
    await expect(page.getByRole("link", { name: "Ver mi resumen", exact: true }).first()).toHaveAttribute("href", "/");
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


test("AUD-E2E-INI-001 · resumen parcial se identifica y permite revisar pendientes", async ({ page }) => {
  await mockOnboarding(page, "ready");
  await page.route("**/api/dashboard?scope=all", async (route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        failedSources: ["budgets"],
        data: { financial: {}, transactions: {}, monthly: { rows: [] }, budgets: null, forecast: {} },
      }),
    });
  });
  await page.goto("/onboarding");
  await expect(page.locator("main[data-activation-complete]")).toHaveAttribute("data-activation-complete", "false");
  const summary = page.locator('[data-step-status="Parcial"]');
  await expect(summary).toContainText("presupuestos");
  await expect(summary).toContainText("Resumen parcial");
  await expect(page.getByRole("link", { name: "Ver qué necesita atención" })).toHaveAttribute("href", "/review");
});

test("AUD-E2E-INI-001 · un saldo sin lectura confirmada impide declarar Inicio completo", async ({ page }) => {
  await mockOnboarding(page, "ready");
  await page.route("**/api/financial?mode=balance_series**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "balance_unavailable" }) });
  });
  await page.goto("/onboarding");
  await expect(page.locator("main[data-activation-complete]")).toHaveAttribute("data-activation-complete", "false");
  await expect(page.locator('[data-step-status="Parcial"]')).toContainText("evolución del saldo");
});
