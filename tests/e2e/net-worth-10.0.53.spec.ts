import { expect, test } from "@playwright/test";
import { buildNetWorthSnapshot } from "../../src/application/net-worth/net-worth";

const accountBase = {
  currency: "EUR" as const,
  lifecycle: "active" as const,
  balanceSource: "bank_explicit" as const,
  explicitBalanceDate: "2026-10-01",
};

test("net worth engine uses assets minus known liabilities and excludes ambiguous balances", async () => {
  const snapshot = buildNetWorthSnapshot([
    { ...accountBase, id: "a", name: "Principal", type: "checking", balanceCents: 200_000 },
    { ...accountBase, id: "b", name: "Ahorro", type: "savings", balanceCents: 100_000 },
    { ...accountBase, id: "c", name: "Inversión", type: "investment", balanceCents: 50_000 },
    { ...accountBase, id: "d", name: "Descubierto", type: "checking", balanceCents: -20_000 },
    { ...accountBase, id: "e", name: "Tarjeta", type: "credit", balanceCents: -30_000 },
    { ...accountBase, id: "f", name: "Crédito ambiguo", type: "credit", balanceCents: 5_000 },
    { ...accountBase, id: "g", name: "Otro", type: "other", balanceCents: 70_000 },
  ], "2026-10-01");

  expect(snapshot.assetsCents).toBe(350_000);
  expect(snapshot.liabilitiesCents).toBe(50_000);
  expect(snapshot.netWorthCents).toBe(300_000);
  expect(snapshot.includedAccounts).toBe(5);
  expect(snapshot.excludedAccounts).toBe(2);
  expect(snapshot.principles.bankSource).toBe("read_only");
  expect(snapshot.principles.assetsMinusLiabilities).toBe(true);
  expect(snapshot.principles.ambiguousCreditBalancesExcluded).toBe(true);
});

async function mockBalances(page: import("@playwright/test").Page) {
  await page.route(/\/api\/financial\?mode=balances(?:&.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        asOfDate: "2026-10-01",
        includeArchived: false,
        accountId: null,
        totalBalanceCents: 245_000,
        activeBalanceCents: 245_000,
        quality: {
          accounts: 5,
          explicitBalanceAccounts: 5,
          reconstructedBalanceAccounts: 0,
          integrityDeltaAccounts: 0,
        },
        accounts: [
          { ...accountBase, id: "a", name: "Cuenta principal", type: "checking", openingBalanceCents: 0, balanceCents: 200_000, explicitBalanceCents: 200_000, explicitSourceRowKey: "A-1", reconstructedBalanceCents: 200_000, reconstructionDeltaCents: 0 },
          { ...accountBase, id: "b", name: "Ahorro", type: "savings", openingBalanceCents: 0, balanceCents: 100_000, explicitBalanceCents: 100_000, explicitSourceRowKey: "B-1", reconstructedBalanceCents: 100_000, reconstructionDeltaCents: 0 },
          { ...accountBase, id: "c", name: "Descubierto", type: "checking", openingBalanceCents: 0, balanceCents: -20_000, explicitBalanceCents: -20_000, explicitSourceRowKey: "C-1", reconstructedBalanceCents: -20_000, reconstructionDeltaCents: 0 },
          { ...accountBase, id: "d", name: "Tarjeta", type: "credit", openingBalanceCents: 0, balanceCents: -30_000, explicitBalanceCents: -30_000, explicitSourceRowKey: "D-1", reconstructedBalanceCents: -30_000, reconstructionDeltaCents: 0 },
          { ...accountBase, id: "e", name: "Cuenta sin clasificar", type: "other", openingBalanceCents: 0, balanceCents: -5_000, explicitBalanceCents: -5_000, explicitSourceRowKey: "E-1", reconstructedBalanceCents: -5_000, reconstructionDeltaCents: 0 },
        ],
      }),
    });
  });
}

test("Patrimonio presents traceable assets, liabilities and exclusions", async ({ page }) => {
  await mockBalances(page);
  await page.goto("/net-worth");

  await expect(page.getByRole("heading", { name: "Lo que tienes menos lo que debes" })).toBeVisible();
  await expect(page.getByLabel("Patrimonio financiero conocido").getByText("2.500,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("3.000,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("500,00 €", { exact: true })).toBeVisible();
  await expect(page.getByText("Cuenta sin clasificar")).toBeVisible();
  await expect(page.getByText(/No incluye inmuebles, vehículos/)).toBeVisible();
  await expect(page.getByText(/solo lectura/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar cuentas y saldos" })).toHaveAttribute("href", "/accounts");
});

test("Patrimonio remains usable on narrow mobile screens", async ({ page }) => {
  await mockBalances(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/net-worth");

  await expect(page.getByRole("heading", { name: "Lo que tienes menos lo que debes" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const reviewLink = page.getByRole("link", { name: "Revisar cuentas y saldos" });
  const box = await reviewLink.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
