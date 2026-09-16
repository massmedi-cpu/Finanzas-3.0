import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function mockReviewSources(page: Page) {
  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());
    const totalCount = url.searchParams.get("reviewState") === "needs_review" ? 3 : 0;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [], totalCount, hasMore: false, nextCursor: null }) });
  });
  await page.route("**/api/recurrences**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ existingStatus: null }, { existingStatus: "active" }] }) }));
  await page.route("**/api/documents**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) }));
  await page.route("**/api/budgets**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [{ status: "over" }, { status: "over" }, { status: "within" }] }) }));
  await page.route("**/api/forecast**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "temporary_unavailable" }) }));
  await page.route("**/api/source/google/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, connection: { connected: true } }) }));
  await page.route("**/api/source/google/sync", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: { status: "success", rowsFailed: 0, warningsCount: 0, errorCode: null } }) }));
}

test("Para revisar prioriza acciones reales y compacta las áreas sin incidencias", async ({ page }) => {
  await mockReviewSources(page);
  await page.goto("/review");

  await expect(page.getByRole("heading", { name: "Para revisar" })).toBeVisible();
  await expect(page.getByText("6", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("acciones pendientes", { exact: true })).toBeVisible();

  const actions = page.getByRole("region", { name: "Requiere atención" });
  await expect(actions.getByRole("heading", { name: "Movimientos por revisar" })).toBeVisible();
  await expect(actions.getByRole("heading", { name: "Recurrentes sin decidir" })).toBeVisible();
  await expect(actions.getByRole("heading", { name: "Presupuestos excedidos" })).toBeVisible();
  await expect(actions.getByRole("heading", { name: "Posibles duplicados" })).toHaveCount(0);

  const reviewLink = actions.getByRole("link", { name: "Revisar" }).first();
  await expect(reviewLink).toHaveAttribute("href", "/transactions?reviewState=needs_review");

  const clear = page.getByRole("region", { name: "Todo en orden" });
  await expect(clear.getByText("Posibles duplicados", { exact: true })).toBeVisible();
  await expect(clear.getByText("Documentos pendientes", { exact: true })).toBeVisible();
  await expect(clear.getByText("Sincronización bancaria", { exact: true })).toBeVisible();

  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  await expect(unavailable.getByText("Previsiones con baja confianza", { exact: true })).toBeVisible();
  await expect(unavailable.getByRole("link", { name: "Abrir sección" })).toHaveAttribute("href", "/forecast");
});

test("Para revisar no confunde una fuente caída con cero incidencias", async ({ page }) => {
  await mockReviewSources(page);
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "No se pudo comprobar" })).toBeVisible();
  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  await expect(unavailable.getByText("Previsiones con baja confianza", { exact: true })).toBeVisible();
  const clear = page.getByRole("region", { name: "Todo en orden" });
  await expect(clear.getByText("Previsiones con baja confianza", { exact: true })).toHaveCount(0);
});

test("Para revisar conserva navegación táctil y sin desbordamiento en móvil", async ({ page }) => {
  await mockReviewSources(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Requiere atención" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const undersizedLinks = await page.locator("main a[href]").evaluateAll((elements) => elements.filter((element) => {
    const box = (element as HTMLElement).getBoundingClientRect();
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && box.height < 44;
  }).map((element) => `${element.textContent?.trim() ?? "link"}:${Math.round((element as HTMLElement).getBoundingClientRect().height)}px`));
  expect(undersizedLinks).toEqual([]);
});

test("El centro de acción permanece read-only y reutiliza módulos propietarios", () => {
  const source = readFileSync(resolve(process.cwd(), "app/review/review-client.tsx"), "utf8");
  expect(source).toContain("/api/transactions?reviewState=needs_review&limit=1");
  expect(source).toContain("/api/transactions?duplicateState=suspected&limit=1");
  expect(source).toContain("/api/recurrences?minOccurrences=3");
  expect(source).toContain("/api/documents?status=pending_review");
  expect(source).not.toContain('method: "POST"');
  expect(source).not.toContain('method: "PATCH"');
  expect(source).not.toContain("localStorage");
});
