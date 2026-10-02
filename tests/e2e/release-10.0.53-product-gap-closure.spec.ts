import { expect, test } from "@playwright/test";

const balances = {
  asOfDate: "2026-10-02",
  activeBalanceCents: 103000,
  accounts: [
    { id: "a1", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 120000, explicitBalanceDate: "2026-10-02" },
    { id: "a2", name: "Tarjeta", type: "credit", lifecycle: "active", balanceCents: -17000, explicitBalanceDate: "2026-10-02" },
    { id: "a3", name: "Ahorro", type: "savings", lifecycle: "archived", balanceCents: 999999, explicitBalanceDate: "2026-09-01" },
  ],
};

async function mockNetWorth(page: import("@playwright/test").Page) {
  await page.route("**/api/financial?mode=balances", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(balances) });
  });
}

async function mockSource(page: import("@playwright/test").Page) {
  await page.route("**/api/source/google/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        connection: {
          connected: true,
          accountEmail: "reader@example.invalid",
          sourceFileName: "Movimientos bancarios - fuente",
          lastVerifiedAt: "2026-10-02T08:00:00Z",
          readonly: true,
        },
      }),
    });
  });
  await page.route("**/api/source/google/sync", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rowsInserted: 0, rowsRevised: 0, rowsSkipped: 25, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0 }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          status: "success",
          startedAt: "2026-10-02T08:00:00Z",
          finishedAt: "2026-10-02T08:00:03Z",
          rowsInserted: 0,
          rowsRevised: 0,
          rowsSkipped: 25,
          rowsFailed: 0,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
        },
        cursors: [],
      }),
    });
  });
  await page.route("**/api/health/source-runtime", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", compatible: true }) });
  });
}

test("Patrimonio derives assets and liabilities from central balances without archived accounts", async ({ page }) => {
  await mockNetWorth(page);
  await page.goto("/net-worth");

  await expect(page.getByRole("heading", { name: "Patrimonio bancario", level: 1 })).toBeVisible();
  await expect(page.getByText("1.030,00 €")).toBeVisible();
  await expect(page.getByText("1.200,00 €")).toBeVisible();
  await expect(page.getByText("170,00 €")).toBeVisible();
  await expect(page.getByText("Cuenta principal")).toBeVisible();
  await expect(page.getByText("Tarjeta")).toBeVisible();
  await expect(page.getByText("Ahorro")).toHaveCount(0);
  await expect(page.getByText(/No incluye todavía vivienda, vehículos/)).toBeVisible();
});

test("Fuente bancaria defaults to plain-language status and keeps diagnostics collapsed", async ({ page }) => {
  await mockSource(page);
  await page.goto("/configuration/source");

  await expect(page.getByRole("heading", { name: "Fuente bancaria", level: 1 })).toBeVisible();
  await expect(page.getByText("Fuente conectada", { exact: true })).toBeVisible();
  await expect(page.getByText("Solo lectura", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualizar datos" })).toBeEnabled();

  const diagnostics = page.locator("details");
  await expect(diagnostics).not.toHaveAttribute("open", "");
  await expect(page.getByText("Diagnóstico técnico y opciones avanzadas")).toBeVisible();

  await page.getByRole("button", { name: "Actualizar datos" }).click();
  await expect(page.getByRole("status")).toContainText("no hay cambios nuevos");
});
