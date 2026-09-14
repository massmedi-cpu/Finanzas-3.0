import { expect, test, type Locator, type Page } from "@playwright/test";

async function fontSize(locator: Locator) {
  return locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

async function expectMobileSafe(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function expectTouchSafe(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test("Reglas mantiene microtexto funcional legible y controles táctiles", async ({ page }) => {
  await page.route("**/api/rules", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rules: [{
            id: "rule-1", name: "Regla prueba", status: "active", priority: 10,
            concept_contains: "supermercado", merchant_id: null, account_id: null, category_id: null,
            minimum_amount_cents: null, maximum_amount_cents: null,
            target_category_id: null, target_merchant_id: null,
            merchant_name: null, account_name: null, category_name: null,
            target_category_name: null, target_merchant_name: null,
          }],
          accounts: [], categories: [], merchants: [],
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/configuration/rules");

  const card = page.locator("article").filter({ hasText: "Regla prueba" });
  for (const locator of [
    page.getByText("FASE 3 · MOTOR CENTRAL DETERMINISTA"),
    page.getByText("ORDEN DE EJECUCIÓN"),
    card.getByText("P10", { exact: true }),
    card.getByText("Activa", { exact: true }),
  ]) {
    await expect(locator).toBeVisible();
    expect(await fontSize(locator)).toBeGreaterThanOrEqual(13);
  }

  await expectTouchSafe(page.getByRole("button", { name: "Actualizar" }));
  await expectTouchSafe(page.getByRole("button", { name: "+ Nueva regla" }));
  await expectMobileSafe(page);
});

test("Comercios mantiene jerarquía operativa legible y móvil", async ({ page }) => {
  await page.route("**/api/merchants", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          merchants: [{
            id: "merchant-1", name: "Carrefour", normalized_name: "carrefour",
            default_category_id: null, lifecycle: "active", default_category_name: null,
            default_category_kind: null, default_category_lifecycle: null, alias_count: 0,
          }],
          aliases: [],
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/configuration", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [] }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/configuration/merchants");

  for (const locator of [
    page.getByText("FASE 3 · NORMALIZACIÓN CENTRAL"),
    page.getByText("FUENTE DE VERDAD"),
  ]) {
    await expect(locator).toBeVisible();
    expect(await fontSize(locator)).toBeGreaterThanOrEqual(13);
  }

  await expectTouchSafe(page.getByRole("button", { name: "Actualizar comercios" }));
  await expectTouchSafe(page.getByRole("button", { name: "+ Nuevo comercio" }));
  await expectMobileSafe(page);
});

test("Fuente bancaria hace legibles prevalidación y métricas sin romper reflow", async ({ page }) => {
  await page.route("**/api/health/source-runtime", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok", compatible: true,
        capabilities: { contractVersion: 2, sourceAccountLifecycle: true, canonicalProductSelection: true },
      }),
    });
  });
  await page.route("**/api/source/google/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        authMode: "oauth",
        connection: {
          connected: true, accountEmail: "beta@example.test", sourceFileName: "Fuente prueba",
          connectedAt: "2026-09-12T08:00:00.000Z", lastVerifiedAt: null, readonly: true,
        },
      }),
    });
  });
  await page.route("**/api/source/google/sync", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: null, cursors: [] }) });
  });
  await page.route("**/api/source/google/preflight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceFileId: "sheet-test", sourceRevision: "drive-version:1", schemaFingerprint: "a".repeat(64),
        totalAuthoritativeRows: 25,
        accounts: [{
          accountExternalKey: "principal", accountName: "Cuenta principal", accountType: "checking",
          lifecycle: "active", authoritativeRows: 25, openingBalanceCents: 0,
          newestBankDate: "2026-09-12", oldestBankDate: "2026-01-01", latestBalanceAfterCents: 123456,
        }],
        cursors: [{ sourceSheetId: "sheet-1", sheetTitle: "Cuenta principal", authoritativeRows: 25, lastSourceRowKey: "ROW-25" }],
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/configuration/source");

  const validate = page.getByRole("button", { name: "Validar fuente antes de importar" });
  await expect(validate).toBeVisible();
  await expectTouchSafe(validate);
  await validate.click();

  await expect(page.getByRole("heading", { name: "Fotografía autoritativa antes de importar" })).toBeVisible();
  const accountMeta = page.getByText("Activa · checking", { exact: true });
  await expect(accountMeta).toBeVisible();
  expect(await fontSize(accountMeta)).toBeGreaterThanOrEqual(13);

  const movementMetric = page.locator("dt").filter({ hasText: /^Movimientos$/ });
  await expect(movementMetric).toBeVisible();
  expect(await fontSize(movementMetric)).toBeGreaterThanOrEqual(13);
  await expectMobileSafe(page);
});
