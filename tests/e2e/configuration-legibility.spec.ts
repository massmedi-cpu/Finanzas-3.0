import { expect, test } from "@playwright/test";

const FIXTURE = {
  accounts: [
    {
      id: "10000000-0000-4000-8000-000000000010",
      name: "Cuenta principal",
      institution: "Banco prueba",
      type: "checking",
      openingBalanceCents: 123456,
      currency: "EUR",
      lifecycle: "active",
      sortOrder: 0,
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
  ],
  categories: [],
};

async function fontSize(locator: import("@playwright/test").Locator) {
  return locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

test("configuration keeps functional microcopy legible and controls touch-safe", async ({ page }) => {
  await page.route("**/api/configuration", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/configuration");

  for (const locator of [
    page.locator(".panel-kicker").first(),
    page.locator(".status-chip").first(),
    page.locator(".field-hint").first(),
    page.locator(".config-tabs button span").first(),
  ]) {
    await expect(locator).toBeVisible();
    expect(await fontSize(locator)).toBeGreaterThanOrEqual(13);
  }

  for (const control of [
    page.getByRole("button", { name: "Actualizar datos" }),
    page.getByRole("button", { name: /Cuentas/ }),
    page.getByRole("button", { name: "Crear cuenta" }),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
