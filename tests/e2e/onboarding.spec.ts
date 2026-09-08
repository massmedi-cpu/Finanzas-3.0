import { expect, test } from "@playwright/test";

type Setup = {
  sourceReady: boolean;
  activeAccounts: number;
  financialReady: boolean;
};

async function mockOnboardingApis(page: import("@playwright/test").Page, setup: Setup) {
  const writes: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${url.pathname}`);
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "read_only_onboarding" }) });
      return;
    }

    if (url.pathname === "/api/source/google/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: setup.sourceReady,
          connection: setup.sourceReady ? { connected: true, sourceFileName: "Finanzas.xlsx" } : null,
        }),
      });
      return;
    }

    if (url.pathname === "/api/source/google/sync") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          run: setup.sourceReady ? { status: "success", rowsFailed: 0, warningsCount: 0, errorCode: null } : null,
          cursors: setup.sourceReady ? [{ sourceSheetId: "sheet-1" }] : [],
        }),
      });
      return;
    }

    if (url.pathname === "/api/configuration") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accounts: Array.from({ length: setup.activeAccounts }, (_, index) => ({ id: `account-${index}`, lifecycle: "active" })),
          categories: [],
        }),
      });
      return;
    }

    if (url.pathname === "/api/financial" && url.searchParams.get("mode") === "snapshot") {
      await route.fulfill({
        status: setup.financialReady ? 200 : 503,
        contentType: "application/json",
        body: JSON.stringify(setup.financialReady ? { contractVersion: 1, principles: { bankSource: "read_only" } } : { error: "financial_unavailable" }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_mocked" }) });
  });

  return writes;
}

test("E3 · Primeros pasos refleja el estado real y nunca escribe datos", async ({ page }) => {
  const writes = await mockOnboardingApis(page, { sourceReady: true, activeAccounts: 2, financialReady: true });
  await page.goto("/onboarding");

  await expect(page.getByRole("heading", { name: "Primeros pasos", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Primeros pasos" })).toHaveAttribute("aria-current", "page");

  const source = page.getByRole("article", { name: "Paso 1 · Fuente bancaria" });
  const accounts = page.getByRole("article", { name: "Paso 2 · Cuentas" });
  const summary = page.getByRole("article", { name: "Paso 3 · Primer resumen" });
  const review = page.getByRole("article", { name: "Paso 4 · Pendientes" });

  await expect(source.getByText("Completado", { exact: true })).toBeVisible();
  await expect(accounts.getByText("Completado", { exact: true })).toBeVisible();
  await expect(summary.getByText("Listo", { exact: true })).toBeVisible();
  await expect(review.getByText("Listo", { exact: true })).toBeVisible();

  await expect(source.getByRole("link")).toHaveAttribute("href", "/configuration/source");
  await expect(accounts.getByRole("link")).toHaveAttribute("href", "/accounts");
  await expect(summary.getByRole("link")).toHaveAttribute("href", "/");
  await expect(review.getByRole("link")).toHaveAttribute("href", "/review");
  await expect(page.getByText(/no guarda casillas ni duplica información financiera/i)).toBeVisible();
  expect(writes).toEqual([]);

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(horizontalOverflow).toBe(false);

  const controlsTooSmall = await page.locator("main a, nav a, main button").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.height < 44;
    }).length,
  );
  expect(controlsTooSmall).toBe(0);
});

test("E3 · Primeros pasos bloquea la secuencia si la fuente todavía no está validada", async ({ page }) => {
  const writes = await mockOnboardingApis(page, { sourceReady: false, activeAccounts: 2, financialReady: true });
  await page.goto("/onboarding");

  const source = page.getByRole("article", { name: "Paso 1 · Fuente bancaria" });
  const accounts = page.getByRole("article", { name: "Paso 2 · Cuentas" });
  const summary = page.getByRole("article", { name: "Paso 3 · Primer resumen" });
  const review = page.getByRole("article", { name: "Paso 4 · Pendientes" });

  await expect(source.getByText("Pendiente", { exact: true })).toBeVisible();
  await expect(accounts.getByText("Bloqueado", { exact: true })).toBeVisible();
  await expect(summary.getByText("Bloqueado", { exact: true })).toBeVisible();
  await expect(review.getByText("Bloqueado", { exact: true })).toBeVisible();
  await expect(source.getByRole("link", { name: /conectar y validar/i })).toHaveAttribute("href", "/configuration/source");
  expect(writes).toEqual([]);
});

test("E3 · sin cuentas mantiene el resumen y los pendientes bloqueados aunque la fuente esté lista", async ({ page }) => {
  await mockOnboardingApis(page, { sourceReady: true, activeAccounts: 0, financialReady: true });
  await page.goto("/onboarding");

  await expect(page.getByRole("article", { name: "Paso 1 · Fuente bancaria" }).getByText("Completado", { exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Paso 2 · Cuentas" }).getByText("Pendiente", { exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Paso 3 · Primer resumen" }).getByText("Bloqueado", { exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Paso 4 · Pendientes" }).getByText("Bloqueado", { exact: true })).toBeVisible();
});
