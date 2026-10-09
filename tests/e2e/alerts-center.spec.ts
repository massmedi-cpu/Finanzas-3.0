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
  await page.route("**/api/documents?scope=ordinary&*", async (route) => {
    const url = new URL(route.request().url());
    const unassociatedOnly = url.searchParams.get("unassociated") === "true";
    const pendingOnly = url.searchParams.get("status") === "pending_review";
    if (!unassociatedOnly && !pendingOnly) throw new Error("Unexpected unfiltered documents list read");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total: 1, limit: 1, offset: 0, items: [] }),
    });
  });
}

test("Alertas · agrupa señales ordinarias, excluye Pruebas y mantiene acciones de solo lectura", async ({ page }) => {
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

test("AUD-E2E-REG-001 · Alertas traduce prioridad a importancia y reserva índice al detalle", async ({ page }) => {
  await mockAlerts(page);
  await page.goto("/alerts");
  const documentAlert = page.locator("article").filter({ hasText: "1 documento sin asociar" });
  await expect(documentAlert).toContainText("Información útil");
  await expect(documentAlert).not.toContainText("Prioridad 68");
  const detail = documentAlert.locator("details");
  await expect(detail).not.toHaveAttribute("open");
  await detail.locator("summary").click();
  await expect(detail).toContainText("Índice de prioridad 68");
  await expect(detail).toContainText("no es una puntuación de riesgo financiero");
});

test("RECUPERACION-PRODUCTO · 50000 documentos no generan paginación masiva en Alertas", async ({ page }) => {
  const reads: Array<{ pathname: string; status: string | null; unassociated: string | null; limit: string | null; method: string }> = [];
  await page.route("**/api/dashboard?scope=all", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ failedSources: [], data: { financial: null, budgets: null, forecast: null } }),
  }));
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ run: { status: "success", rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0 } }),
  }));
  await page.route("**/api/transactions?uncategorized=true&limit=1", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ totalCount: 0 }),
  }));
  await page.route("**/api/documents?scope=ordinary&*", (route) => {
    const url = new URL(route.request().url());
    reads.push({
      pathname: url.pathname,
      status: url.searchParams.get("status"),
      unassociated: url.searchParams.get("unassociated"),
      limit: url.searchParams.get("limit"),
      method: route.request().method(),
    });
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ total: url.searchParams.get("unassociated") === "true" ? 50_000 : 125, limit: 1, offset: 0, items: [] }),
    });
  });
  await page.goto("/alerts");
  await expect(page.getByRole("heading", { name: "Alertas" })).toBeVisible();
  await expect(page.getByText(/50\\.000 documentos sin asociar/)).toBeVisible();
  await expect(page.getByText(/125 documentos pendientes de revisar/)).toBeVisible();
  expect(reads).toHaveLength(2);
  expect(reads).toEqual(expect.arrayContaining([
    expect.objectContaining({ pathname: "/api/documents", unassociated: "true", status: null, limit: "1", method: "GET" }),
    expect.objectContaining({ pathname: "/api/documents", unassociated: null, status: "pending_review", limit: "1", method: "GET" }),
  ]));
});
