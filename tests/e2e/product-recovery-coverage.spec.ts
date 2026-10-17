import { expect, test } from "@playwright/test";
import { mockRecoveryHome } from "./helpers/recovery-home";

test("REC-DAT · un mes sin cobertura no genera presupuesto favorable, barras cero ni memoria monetaria", async ({ page }) => {
  await mockRecoveryHome(page);
  await page.goto("/");
  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  await expect(brief).toContainText("Presupuesto pendiente de datos");
  await expect(brief).not.toContainText("Presupuesto dentro del límite");
  await expect(brief).not.toContainText("0% usado");
  await expect(page.locator('[data-budget-coverage="none"]')).toContainText("Gasto sin confirmar");
  const month = page.locator('[data-month-coverage="none"]');
  await expect(month).toHaveCount(1);
  await expect(month).toHaveAccessibleName(/octubre de 2026: sin cobertura bancaria confirmada/);
  await expect(month.locator('[data-zero="true"]')).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "octubre de 2026" })).toContainText("Las cifras del mes están pendientes");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("financial-app:home-last-visit:v1") ?? "{}").expenseCents)).toBeNull();
  const memory = await page.evaluate(() => JSON.parse(localStorage.getItem("financial-app:home-last-visit:v1") ?? "{}"));
  expect(memory.operatingNetCents).toBeNull();
  expect(memory.budgetProgressBps).toBeNull();
  expect(memory.budgetStatus).toBeNull();
  await page.getByRole("button", { name: "Flujo neto", exact: true }).click();
  // There may be multiple historical months without certified coverage.
  // The selected empty month must never be drawn as a false zero bar.
  expect(await page.locator('[data-series-missing="true"]').count()).toBeGreaterThan(0);
});

test("REC-DAT · el presupuesto parcial muestra su base y reserva una conclusión favorable", async ({ page }) => {
  await mockRecoveryHome(page, "partial");
  await page.goto("/");
  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  await expect(brief).toContainText("Presupuesto con datos parciales");
  await expect(brief).not.toContainText("Presupuesto dentro del límite");
  await expect(page.getByText("El porcentaje refleja el gasto importado; puede aumentar.", { exact: false })).toBeVisible();
});

test("REC-CHART · un mes observado conserva cifras, tabla accesible y movimientos del mismo periodo", async ({ page }) => {
  await mockRecoveryHome(page, "covered");
  await page.goto("/");
  const brief = page.getByRole("region", { name: "Resumen inteligente" });
  await expect(brief).toContainText("Presupuesto con datos parciales");
  await expect(brief).not.toContainText("Presupuesto dentro del límite");
  await page.getByRole("button", { name: /septiembre de 2026.*ingresos/ }).focus();
  const drilldown = page.getByRole("link", { name: "Ver movimientos de este mes" });
  await expect(drilldown).toHaveAttribute("href", "/transactions?dateFrom=2026-09-01&dateTo=2026-09-30");
  await page.getByText("Ver datos por mes", { exact: true }).click();
  const table = page.getByRole("table").filter({ hasText: "Cobertura" });
  await expect(table.getByRole("row").filter({ hasText: "septiembre de 2026" })).toContainText("1.500,00");
  await page.getByRole("button", { name: "Ocultar importes", exact: true }).click();
  await expect(table).not.toContainText("1.500,00");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("financial-app:home-last-visit:v1"))).toBeNull();
});

for (const width of [390, 1366]) {
  test(`REC-PERF · ${width}px no solicita rutas anticipadas al abrir Inicio`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockRecoveryHome(page);
    const prefetches: string[] = [];
    page.on("request", (request) => {
      if (request.headers()["next-router-prefetch"]) prefetches.push(request.url());
    });
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Resumen inteligente" })).toContainText("Datos hasta");
    await page.waitForTimeout(1400);
    expect(prefetches).toEqual([]);
  });
}
