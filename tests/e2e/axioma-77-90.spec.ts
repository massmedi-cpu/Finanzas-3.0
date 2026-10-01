import { expect, test, type Page, type Route } from "@playwright/test";

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function isolateData(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/build") return route.continue();
    if (url.pathname === "/api/analysis/source-freshness") {
      return fulfillJson(route, 200, {
        available: true,
        latestMovementDate: "2026-10-01",
        sync: {
          status: "success",
          finishedAt: "2026-10-01T19:30:00.000Z",
          startedAt: "2026-10-01T19:29:00.000Z",
          rowsSeen: 100,
          rowsFailed: 0,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
        },
      });
    }
    return fulfillJson(route, 503, { error: "pre036_data_isolated" });
  });
}

test("PRE-036 · desconexión visible y recuperación automática", async ({ page, context }) => {
  await isolateData(page);
  await page.goto("/");

  await expect(page.getByTestId("offline-status")).toBeHidden();
  await context.setOffline(true);
  await expect(page.getByTestId("offline-status")).toBeVisible();
  await expect(page.getByTestId("offline-status")).toContainText("Sin conexión");
  await expect(page.getByTestId("offline-status")).toHaveAttribute("aria-live", "polite");

  await context.setOffline(false);
  await expect(page.getByTestId("offline-status")).toBeHidden();
});

test("PRE-036 · móvil 320 px no desborda y mantiene targets táctiles", async ({ page }) => {
  await isolateData(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const mobile = page.getByRole("navigation", { name: "Navegación móvil" });
  await expect(mobile).toBeVisible();
  const controls = mobile.locator("a, button");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("PRE-036 · la fuente usa snapshot seguro cuando cae la red", async ({ page, context }) => {
  await isolateData(page);
  await page.goto("/transactions");
  await expect(page.getByText("Fuente comprobada")).toBeVisible();

  const safeSnapshot = await page.evaluate(() => window.localStorage.getItem("financial-app:source-trust-safe-v1"));
  expect(safeSnapshot).toBeTruthy();
  expect(safeSnapshot).not.toMatch(/importe|concepto|iban|amount/i);

  await context.setOffline(true);
  await expect(page.getByText("Fuente sin conexión")).toBeVisible();
  await expect(page.getByText(/Última comprobación segura/)).toBeVisible();
  await context.setOffline(false);
});
