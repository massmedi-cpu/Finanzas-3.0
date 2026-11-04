import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function mockReviewSources(page: Page, options: { failSignMismatch?: boolean } = {}) {
  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("signMismatch") === "true" && options.failSignMismatch) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "temporary_unavailable" }) });
      return;
    }
    const totalCount = url.searchParams.get("reviewState") === "needs_review"
      ? 3
      : url.searchParams.get("signMismatch") === "true"
        ? 2
        : 0;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [], totalCount, hasMore: false, nextCursor: null }) });
  });
  await page.route("**/api/recurrences**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ existingStatus: null }, { existingStatus: "active" }] }) }));
  await page.route("**/api/documents**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) }));
  await page.route("**/api/budgets**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [{ status: "over" }, { status: "over" }, { status: "within" }] }) }));
  await page.route("**/api/forecast**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "temporary_unavailable" }) }));
  await page.route("**/api/source/google/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, connection: { connected: true } }) }));
  await page.route("**/api/source/google/sync", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: { status: "success", finishedAt: new Date().toISOString(), rowsSeen: 3188, rowsFailed: 0, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0, errorCode: null } }) }));
}


test("FA-UI-039 · sincronización antigua sin errores no acredita fuente bancaria actual", async ({ page }) => {
  await mockReviewSources(page);
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ run: {
      status: "success", finishedAt: "2026-10-09T12:11:06Z", rowsSeen: 3188,
      rowsFailed: 0, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0, errorCode: null,
    } }),
  }));
  await page.goto("/review");
  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  await expect(unavailable.getByText("Sincronización bancaria", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Sin incidencias en áreas verificadas" })
    .getByText("Sincronización bancaria", { exact: true })).toHaveCount(0);
});

test("FA-UI-039 · éxito reciente con contadores íntegros conserva estado verificado", async ({ page }) => {
  await mockReviewSources(page);
  await page.goto("/review");
  await expect(page.getByRole("region", { name: "Sin incidencias en áreas verificadas" })
    .getByText("Sincronización bancaria", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "No se pudo comprobar" })
    .getByText("Sincronización bancaria", { exact: true })).toHaveCount(0);
});

test("FA-UI-039 · incidencias confirmadas siguen siendo prioritarias aunque la ejecución sea antigua", async ({ page }) => {
  await mockReviewSources(page);
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ run: {
      status: "partial", finishedAt: "2026-10-09T12:11:06Z", rowsSeen: 3188,
      rowsFailed: 2, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 2, errorCode: null,
    } }),
  }));
  await page.goto("/review");
  await expect(page.getByRole("region", { name: "Requiere atención" })
    .getByRole("heading", { name: "Sincronización bancaria" })).toBeVisible();
});

test("FA-UI-039 · fecha futura tampoco confirma la sincronización", async ({ page }) => {
  await mockReviewSources(page);
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ run: {
      status: "success", finishedAt: new Date(Date.now() + 60_000).toISOString(), rowsSeen: 3188,
      rowsFailed: 0, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0, errorCode: null,
    } }),
  }));
  await page.goto("/review");
  await expect(page.getByRole("region", { name: "No se pudo comprobar" })
    .getByText("Sincronización bancaria", { exact: true })).toBeVisible();
});

test("FA-UI-035 · sin ejecución terminada la sincronización no se considera verificada", async ({ page }) => {
  await mockReviewSources(page);
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ run: null }),
  }));
  await page.goto("/review");

  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  await expect(unavailable.getByText("Sincronización bancaria", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Sin incidencias en áreas verificadas" }).getByText("Sincronización bancaria", { exact: true })).toHaveCount(0);
});

test("FA-UI-035 · HTTP 200 con éxito sin evidencia completa no acredita la sincronización", async ({ page }) => {
  await mockReviewSources(page);
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ run: { status: "success", rowsFailed: 0, warningsCount: 0, errorCode: null } }),
  }));
  await page.goto("/review");

  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  await expect(unavailable.getByText("Sincronización bancaria", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Requiere atención" }).getByText("Sincronización bancaria", { exact: true })).toHaveCount(0);
});

test("FA-UI-037 · una respuesta 200 mal formada no silencia las otras comprobaciones", async ({ page }) => {
  await mockReviewSources(page);
  await page.route("**/api/budgets**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ categories: { status: "over" } }),
  }));
  await page.route("**/api/recurrences**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ candidates: null }),
  }));
  await page.goto("/review");
  const actions = page.getByRole("region", { name: "Requiere atención" });
  await expect(actions.getByRole("heading", { name: "Movimientos por revisar" })).toBeVisible();
  await expect(actions.getByRole("heading", { name: "Signos incoherentes" })).toBeVisible();
  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  await expect(unavailable.getByText("Presupuestos excedidos", { exact: true })).toBeVisible();
  await expect(unavailable.getByText("Recurrentes sin decidir", { exact: true })).toBeVisible();
});

test("FA-UI-037 · recuento negativo no puede aparecer como incidencia verificada", async ({ page }) => {
  await mockReviewSources(page);
  await page.route("**/api/transactions**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("reviewState") === "needs_review") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ totalCount: -1 }) });
    } else {
      await route.fallback();
    }
  });
  await page.goto("/review");
  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  await expect(unavailable.getByText("Movimientos por revisar", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Requiere atención" })
    .getByRole("heading", { name: "Movimientos por revisar" })).toHaveCount(0);
});

test("FA-UI-037 · fuente desconectada se indica aunque falle la lectura del último intento", async ({ page }) => {
  await mockReviewSources(page);
  await page.route("**/api/source/google/status", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, connection: { connected: false } }),
  }));
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }),
  }));
  await page.goto("/review");
  await expect(page.getByRole("region", { name: "Requiere atención" })
    .getByRole("heading", { name: "Sincronización bancaria" })).toBeVisible();
});

test("Para revisar prioriza acciones reales y compacta las áreas sin incidencias", async ({ page }) => {
  await mockReviewSources(page);
  await page.goto("/review");

  await expect(page.getByRole("heading", { name: "Para revisar" })).toBeVisible();
  await expect(page.getByText("8", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("acciones pendientes confirmadas", { exact: true })).toBeVisible();
  await expect(page.getByText("1 comprobación sin verificar", { exact: true })).toBeVisible();

  const actions = page.getByRole("region", { name: "Requiere atención" });
  await expect(actions.getByRole("heading", { name: "Movimientos por revisar" })).toBeVisible();
  await expect(actions.getByRole("heading", { name: "Signos incoherentes" })).toBeVisible();
  await expect(actions.getByRole("heading", { name: "Recurrentes sin decidir" })).toBeVisible();
  await expect(actions.getByRole("heading", { name: "Presupuestos excedidos" })).toBeVisible();
  await expect(actions.getByRole("heading", { name: "Posibles duplicados" })).toHaveCount(0);

  const reviewLink = actions.getByRole("link", { name: "Revisar: Movimientos por revisar", exact: true });
  await expect(reviewLink).toHaveAttribute("href", "/transactions?reviewState=needs_review");

  const clear = page.getByRole("region", { name: "Sin incidencias en áreas verificadas" });
  await expect(clear.getByText("Posibles duplicados", { exact: true })).toBeVisible();
  await expect(clear.getByText("Documentos pendientes", { exact: true })).toBeVisible();
  await expect(clear.getByText("Sincronización bancaria", { exact: true })).toBeVisible();

  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  await expect(unavailable.getByText("Previsiones con baja confianza", { exact: true })).toBeVisible();
  await expect(unavailable.getByRole("link", { name: "Abrir sección: Previsiones con baja confianza", exact: true })).toHaveAttribute("href", "/forecast");
  await expect(page.getByText("Todo en orden", { exact: true })).toHaveCount(0);
});

test("FA-UI-034 · la revisión incompleta prioriza las comprobaciones desconocidas, no un cero", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "temporarily_unavailable" }),
  }));

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/review");
    const header = page.locator("main header").first();
    const unverified = page.getByRole("region", { name: "No se pudo comprobar" });
    await expect(unverified).toBeVisible();
    const missingChecks = await unverified.getByRole("listitem").count();
    expect(missingChecks).toBeGreaterThan(0);
    await expect(header.locator("strong")).toHaveText(String(missingChecks));
    await expect(header).toContainText(missingChecks === 1 ? "comprobación sin verificar" : "comprobaciones sin verificar");
    await expect(header).toContainText("No se han confirmado acciones; la revisión está incompleta");
    await expect(header).not.toContainText("acciones pendientes confirmadas");
    await expect(page.getByText("Revisión incompleta", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test("Para revisar no confunde una fuente caída con cero incidencias", async ({ page }) => {
  await mockReviewSources(page);
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "No se pudo comprobar" })).toBeVisible();
  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  await expect(unavailable.getByText("Previsiones con baja confianza", { exact: true })).toBeVisible();
  const clear = page.getByRole("region", { name: "Sin incidencias en áreas verificadas" });
  await expect(clear.getByText("Previsiones con baja confianza", { exact: true })).toHaveCount(0);
});

test("Para revisar no confunde un control de signo caído con cero incoherencias", async ({ page }) => {
  await mockReviewSources(page, { failSignMismatch: true });
  await page.goto("/review");

  const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
  const signMismatchItem = unavailable.getByRole("listitem").filter({ hasText: "Signos incoherentes" });
  await expect(signMismatchItem).toBeVisible();
  await expect(signMismatchItem.getByRole("link", { name: "Abrir sección: Signos incoherentes", exact: true }))
    .toHaveAttribute("href", "/transactions?signMismatch=true");

  const clear = page.getByRole("region", { name: "Sin incidencias en áreas verificadas" });
  await expect(clear.getByText("Signos incoherentes", { exact: true })).toHaveCount(0);
});


test("FA-UI-032 · enlaces de Revisar tienen nombres accesibles únicos en móvil y escritorio", async ({ page }) => {
  await mockReviewSources(page, { failSignMismatch: true });
  for (const width of [360, 390, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/review");
    const actions = page.getByRole("region", { name: "Requiere atención" });
    const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
    await expect(actions.getByRole("link", { name: "Revisar: Movimientos por revisar", exact: true }))
      .toHaveAttribute("href", "/transactions?reviewState=needs_review");
    await expect(unavailable.getByRole("link", { name: "Abrir sección: Signos incoherentes", exact: true }))
      .toHaveAttribute("href", "/transactions?signMismatch=true");
    await expect(unavailable.getByRole("link", { name: "Abrir sección: Previsiones con baja confianza", exact: true }))
      .toHaveAttribute("href", "/forecast");
    const labels = await page.locator("main a[aria-label]").evaluateAll((links) =>
      links.map((link) => link.getAttribute("aria-label") ?? ""),
    );
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(new Set(labels).size).toBe(labels.length);
  }
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

test("FA-UI-033 · botones de comprobaciones no verificadas quedan alineados y con foco visible", async ({ page }) => {
  await mockReviewSources(page, { failSignMismatch: true });

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/review");

    const unavailable = page.getByRole("region", { name: "No se pudo comprobar" });
    const rows = unavailable.getByRole("listitem");
    await expect(rows).toHaveCount(2);

    for (const row of await rows.all()) {
      const label = row.locator("span").first();
      const action = row.getByRole("link");
      const labelBox = await label.boundingBox();
      const actionBox = await action.boundingBox();
      expect(labelBox).not.toBeNull();
      expect(actionBox).not.toBeNull();
      expect(actionBox!.height).toBeGreaterThanOrEqual(44);
      expect(actionBox!.x).toBeGreaterThanOrEqual(labelBox!.x + labelBox!.width - 1);
      expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(width + 1);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.keyboard.press("Tab");
    const focusLink = unavailable.getByRole("link", { name: "Abrir sección: Signos incoherentes", exact: true });
    await focusLink.focus();
    await expect(focusLink).toBeFocused();
    const outline = await focusLink.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { style: computed.outlineStyle, width: Number.parseFloat(computed.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(3);
  }
});

test("El centro de acción permanece read-only y reutiliza módulos propietarios", () => {
  const source = readFileSync(resolve(process.cwd(), "app/review/review-client.tsx"), "utf8");
  expect(source).toContain("/api/transactions?reviewState=needs_review&limit=1");
  expect(source).toContain("/api/transactions?signMismatch=true&limit=1");
  expect(source).toContain('href: "/transactions?signMismatch=true"');
  expect(source).toContain("/api/transactions?duplicateState=suspected&limit=1");
  expect(source).toContain("/api/recurrences?minOccurrences=3");
  expect(source).toContain("/api/documents?status=pending_review");
  expect(source).not.toContain('method: "POST"');
  expect(source).not.toContain('method: "PATCH"');
  expect(source).not.toContain("localStorage");
});
