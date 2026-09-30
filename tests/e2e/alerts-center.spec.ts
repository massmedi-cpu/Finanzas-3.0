import { expect, test, type Page } from "@playwright/test";

function madridDatePlus(days: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Madrid",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  const shifted = new Date(Date.UTC(values.year, values.month - 1, values.day + days, 12));
  return shifted.toISOString().slice(0, 10);
}

async function mockAlerts(page: Page) {
  const upcomingPaymentDate = madridDatePlus(2);

  await page.route("**/api/dashboard?scope=all", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        failedSources: [],
        data: {
          financial: {
            period: {
              operatingNetCents: -20_00,
              quality: { suspectedDuplicateRows: 2, signMismatchRows: 0 },
            },
          },
          budgets: {
            categories: [
              { categoryName: "Compras", progressBps: 9_250, status: "on_track" },
              { categoryName: "Casa", progressBps: 4_000, status: "on_track" },
            ],
          },
          forecast: {
            summary: { projectedClosingBalanceCents: 300_00, plannedItems: 1 },
            items: [
              { date: upcomingPaymentDate, concept: "Recibo", amountCents: -35_00, status: "planned", affectsProjection: true },
            ],
          },
        },
      }),
    });
  });
  await page.route("**/api/source/google/sync", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          status: "success",
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
          rowsFailed: 0,
        },
      }),
    });
  });
  await page.route("**/api/transactions?uncategorized=true&limit=1", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [], totalCount: 3 }) });
  });
  await page.route("**/api/documents?limit=100&offset=0", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total: 3,
        limit: 100,
        offset: 0,
        items: [
          { id: "a", status: "confirmed", associationCount: 0 },
          { id: "b", status: "pending_review", associationCount: 1 },
          { id: "c", status: "archived", associationCount: 0 },
        ],
      }),
    });
  });
}

test("Alertas · agrupa señales globales, prioriza y mantiene acciones de solo lectura", async ({ page }) => {
  await mockAlerts(page);
  await page.goto("/alerts");

  await expect(page.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
  await expect(page.getByText("2 posibles movimientos duplicados", { exact: true })).toBeVisible();
  await expect(page.getByText("1 presupuesto cerca del límite", { exact: true })).toBeVisible();
  await expect(page.getByText("3 movimientos sin categorizar", { exact: true })).toBeVisible();
  await expect(page.getByText("1 pago previsto en los próximos 7 días", { exact: true })).toBeVisible();
  await expect(page.getByText("1 documento sin asociar", { exact: true })).toBeVisible();
  await expect(page.getByText("1 documento pendiente de revisar", { exact: true })).toBeVisible();
  await expect(page.getByText("El resultado del mes está en negativo", { exact: true })).toBeVisible();
  await expect(page.getByText("Financial App agrupa señales ya calculadas o persistidas.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar duplicados" })).toHaveAttribute("href", "/transactions?duplicateState=suspected");
  await expect(page.getByRole("link", { name: "Categorizar" })).toHaveAttribute("href", "/transactions?uncategorized=true");
});

test("Alertas · es accesible desde Más en móvil y no provoca overflow horizontal", async ({ page }) => {
  await mockAlerts(page);
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto("/");

  const dock = page.getByRole("navigation", { name: "Navegación móvil" });
  await dock.getByRole("button", { name: "Más", exact: true }).click();
  const more = page.getByRole("navigation", { name: "Más secciones" });
  await expect(more.getByRole("link", { name: "Alertas", exact: true })).toBeVisible();
  await more.getByRole("link", { name: "Alertas", exact: true }).click();

  await expect(page).toHaveURL(/\/alerts$/);
  await expect(page.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
