import { expect, test, type Page } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

const blockedReadEndpoints = [
  "/api/analysis",
  "/api/budgets?month=2026-09",
  "/api/configuration",
  "/api/documents",
  "/api/forecast?dateFrom=2026-09-01&dateTo=2026-09-30",
  "/api/recurrences",
  "/api/transactions?limit=1",
] as const;

const navLabels = [
  "Inicio",
  "Primeros pasos",
  "Para revisar",
  "Movimientos",
  "Análisis",
  "Cuentas",
  "Presupuestos",
  "Recurrentes",
  "Previsión",
  "Documentos",
  "Configuración",
] as const;

const criticalRoutes = [
  "/",
  "/onboarding",
  "/review",
  "/transactions",
  "/analysis",
  "/accounts",
  "/budgets",
  "/recurrences",
  "/forecast",
  "/documents",
  "/configuration",
] as const;

test("protected preview bloquea toda la superficie financiera sin workspace autenticado", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");
  for (const endpoint of blockedReadEndpoints) {
    const response = await request.get(endpoint);
    expect(response.status(), `${endpoint} debe fallar cerrado sin workspace`).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ code: "workspace_context_required" });
    expect(body.error).toEqual(expect.any(String));
  }
});

test("protected preview no puede abrir el autoservicio de borrado de Production", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");
  const response = await request.get("/api/data/deletion");
  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({
    error: "workspace_deletion_production_only",
    code: "preview_production_deletion_forbidden",
  });
});

async function betaJson(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    let body: any = null;
    try { body = await response.json(); } catch {}
    return { status: response.status, body };
  }, { path, init });
}

async function activateBeta(page: Page) {
  test.skip(!isProtectedPreview, "CR-006 simulated personas require the exact protected beta Preview");
  const response = await page.goto("/beta?reset=1", { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/$/, { timeout: 8_000 });
  await expect(page.locator("main")).toBeVisible({ timeout: 8_000 });
  const cookie = (await page.context().cookies()).find((entry) => entry.name === "financial_app_cr006_beta");
  expect(cookie?.value).toBe("1");
  await expect.poll(
    async () => (await betaJson(page, "/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=2026-09-30")).status,
    { timeout: 8_000 },
  ).toBe(200);
}

async function gotoBetaRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(response, `${route}: debe responder`).not.toBeNull();
  expect(response!.status(), `${route}: no debe devolver error de servidor`).toBeLessThan(500);
  await expect(page.locator("main")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 8_000 });
  await expect.poll(
    async () => page.evaluate(() => Boolean((window as any).__FINANCIAL_APP_CR006_BETA__?.active)),
    { timeout: 8_000 },
  ).toBe(true);
}

async function assertNoGlobalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(Math.max(dimensions.html, dimensions.body), `${label}: overflow horizontal global`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function unnamedVisibleControls(page: Page) {
  return page.locator("button, input, select, textarea, a[href], summary").evaluateAll((elements) =>
    elements.flatMap((element) => {
      const node = element as HTMLElement;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden") return [];
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      const ariaLabelledBy = element.getAttribute("aria-labelledby")?.trim();
      const title = element.getAttribute("title")?.trim();
      const text = element.textContent?.trim();
      const id = element.getAttribute("id");
      const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : "";
      const wrappingLabel = element.closest("label")?.textContent?.trim();
      const input = element as HTMLInputElement;
      const fallback = input.placeholder?.trim();
      if (ariaLabel || ariaLabelledBy || title || text || explicitLabel || wrappingLabel || fallback) return [];
      return [{
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type"),
        name: element.getAttribute("name"),
        testid: element.getAttribute("data-testid"),
        html: element.outerHTML.slice(0, 300),
      }];
    }),
  );
}

async function assertVisibleControlsNamed(page: Page, label: string) {
  const unnamed = await unnamedVisibleControls(page);
  expect(unnamed, `${label}: controles visibles sin nombre accesible: ${JSON.stringify(unnamed)}`).toEqual([]);
}

async function assertTouchTargets(page: Page, label: string) {
  const tooSmall = await page.locator("button, input, select, summary, a[href]").evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0 || rect.height >= 44) return [];
      return [{ tag: element.tagName.toLowerCase(), text: element.textContent?.trim().slice(0, 80), height: Math.round(rect.height) }];
    }),
  );
  expect(tooSmall, `${label}: controles con objetivo táctil <44 px: ${JSON.stringify(tooSmall)}`).toEqual([]);
}

test("CR-006 B01 · persona no técnica recorre acceso, orientación y comprensión básica sin ayuda", async ({ page }) => {
  await activateBeta(page);
  await expect(page.getByRole("heading", { name: "Tu dinero, claro en segundos." })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Navegación principal" });
  for (const label of navLabels) await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  await navigation.getByRole("link", { name: "Movimientos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Movimientos", level: 1 })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("CARREFOUR DEMO", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Inicio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tu dinero, claro en segundos." })).toBeVisible();
  const financial = await betaJson(page, "/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=2026-09-30");
  expect(financial.body.period.incomeCents).toBeGreaterThan(0);
  expect(financial.body.period.expenseCents).toBeGreaterThan(0);
  await assertNoGlobalOverflow(page, "B01 Inicio");
});

test("CR-006 B02 · usuario habitual de banca filtra movimientos y modifica presupuesto con formato español", async ({ page }) => {
  await activateBeta(page);
  await gotoBetaRoute(page, "/transactions");
  await expect(page.getByRole("heading", { name: "Movimientos", level: 1 })).toBeVisible();
  await page.getByLabel("Buscar").fill("carrefour");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByText("CARREFOUR DEMO", { exact: true }).first()).toBeVisible();

  await gotoBetaRoute(page, "/budgets");
  await expect(page.getByRole("heading", { name: "Presupuestos", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /(?:Fijar|Editar) límite manual/ }).first().click();
  const manual = page.getByLabel("Presupuesto manual de total mensual");
  await manual.fill("1.234,56");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Límite manual guardado");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
  await expect(page.getByText(/Manual · automático/).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("1.234,56 €", { exact: true }).first()).toBeVisible();
});

test("CR-006 B03 · usuario avanzado valida invariantes financieros y opera la previsión", async ({ page }) => {
  await activateBeta(page);
  const financial = await betaJson(page, "/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=2026-09-30");
  const p = financial.body.period;
  expect(p.operatingNetCents).toBe(p.incomeCents - p.expenseCents + p.refundCents + p.adjustmentCents);
  expect(p.transfers.netCents).toBe(0);
  expect(p.quality.confirmedDuplicateRows).toBe(0);
  const balances = financial.body.balances;
  expect(balances.totalBalanceCents).toBe(balances.accounts.reduce((sum: number, account: any) => sum + account.balanceCents, 0));
  const forecast = await betaJson(page, "/api/forecast?dateFrom=2026-09-12&dateTo=2026-10-12");
  expect(forecast.body.summary.projectedClosingBalanceCents).toBe(forecast.body.summary.openingBalanceCents + forecast.body.summary.projectedNetCents);
  await gotoBetaRoute(page, "/forecast");
  await page.getByLabel("Concepto").fill("Prueba B03 anual");
  await page.getByLabel("Importe").fill("12,34");
  await page.getByRole("button", { name: "Añadir al calendario" }).click();
  await expect(page.getByRole("heading", { name: "Prueba B03 anual", exact: true })).toBeVisible();
});

test("CR-006 B04 · usuario móvil completa las once secciones, OCR y controles táctiles", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile", "B04 representa específicamente usuario móvil");
  test.setTimeout(120_000);
  await activateBeta(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of criticalRoutes) {
    await test.step(`B04 ${route}`, async () => {
      await gotoBetaRoute(page, route);
      await assertNoGlobalOverflow(page, `B04 ${route}`);
      await assertVisibleControlsNamed(page, `B04 ${route}`);
      await assertTouchTargets(page, `B04 ${route}`);
    });
  }
  await gotoBetaRoute(page, "/documents");
  await page.getByRole("button", { name: /factura-demo\.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar con OCR" }).click();
  await expect(page.getByText("FACTURA DEMO")).toBeVisible();
  await expect(page.getByText(/Sin escrituras financieras/)).toBeVisible();
});

test("CR-006 B05 · usuario escritorio hace recorrido integral con teclado, edición y OCR", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "B05 representa específicamente usuario escritorio");
  test.setTimeout(90_000);
  await activateBeta(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("main-content");
  await gotoBetaRoute(page, "/transactions");
  await page.getByLabel("Buscar").fill("telecom");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByText("TELECOM DEMO", { exact: true }).first()).toBeVisible();
  await gotoBetaRoute(page, "/forecast");
  await page.getByLabel("Concepto").fill("Prueba B05 escritorio");
  await page.getByLabel("Importe").fill("5,67");
  await page.getByRole("button", { name: "Añadir al calendario" }).click();
  await expect(page.getByRole("heading", { name: "Prueba B05 escritorio", exact: true })).toBeVisible();
  await gotoBetaRoute(page, "/documents");
  await page.getByRole("button", { name: /factura-demo\.pdf/i }).click();
  await page.getByRole("button", { name: "Analizar con OCR" }).click();
  await expect(page.getByText("FACTURA DEMO")).toBeVisible();
});

test("CR-006 B06 · accesibilidad técnica cubre teclado, zoom 200 %, reflow 400 %, forced colors y semántica", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "B06 se ejecuta una vez en escritorio");
  test.setTimeout(120_000);
  await activateBeta(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("main-content");

  await page.setViewportSize({ width: 640, height: 900 });
  for (const route of ["/", "/transactions", "/budgets", "/forecast", "/documents", "/configuration"] as const) {
    await gotoBetaRoute(page, route);
    await assertNoGlobalOverflow(page, `B06 200 % ${route}`);
    await assertVisibleControlsNamed(page, `B06 200 % ${route}`);
  }

  await page.setViewportSize({ width: 320, height: 900 });
  for (const route of ["/", "/transactions", "/budgets", "/forecast", "/documents", "/configuration"] as const) {
    await gotoBetaRoute(page, route);
    await assertNoGlobalOverflow(page, `B06 400 % ${route}`);
    await assertVisibleControlsNamed(page, `B06 400 % ${route}`);
  }

  await page.emulateMedia({ forcedColors: "active" });
  await gotoBetaRoute(page, "/");
  for (const label of ["Movimientos", "Presupuestos", "Previsión", "Documentos"] as const) {
    await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  expect(await page.locator("nav, main, [role='main'], [role='navigation'], h1").count()).toBeGreaterThan(0);
});

test("CR-006 B07 · perfil breaker fuerza errores, entradas ambiguas y fronteras fail-closed", async ({ page }) => {
  test.setTimeout(60_000);
  await activateBeta(page);
  const unknown = await betaJson(page, "/api/cr006-route-that-must-not-exist");
  expect(unknown.status).toBe(503);
  expect(unknown.body).toMatchObject({ error: "cr006_beta_endpoint_not_implemented" });
  const blockedSupabase = await page.evaluate(async () => {
    const response = await fetch("https://example.supabase.co/rest/v1/private");
    return { status: response.status, body: await response.json() };
  });
  expect(blockedSupabase).toMatchObject({ status: 451, body: { error: "cr006_beta_external_persistence_blocked" } });
  const blockedGoogle = await page.evaluate(async () => {
    const response = await fetch("https://www.googleapis.com/drive/v3/files");
    return { status: response.status, body: await response.json() };
  });
  expect(blockedGoogle).toMatchObject({ status: 451, body: { error: "cr006_beta_external_persistence_blocked" } });

  await gotoBetaRoute(page, "/budgets");
  await page.getByRole("button", { name: /(?:Fijar|Editar) límite manual/ }).first().click();
  await page.getByLabel("Presupuesto manual de total mensual").fill("1,234");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.locator("main").getByRole("alert").filter({ hasText: "Introduce un importe válido" })).toBeVisible();

  await gotoBetaRoute(page, "/transactions");
  await page.getByLabel("Buscar").fill("x".repeat(300));
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByRole("heading", { name: "Movimientos", level: 1 })).toBeVisible();
  await assertNoGlobalOverflow(page, "B07 búsqueda extrema");
});

test("CR-006 B08 · usuario nuevo sin contexto descubre la arquitectura y completa el recorrido inicial", async ({ page }) => {
  await activateBeta(page);
  await gotoBetaRoute(page, "/onboarding");
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Primeros pasos", exact: true })).toHaveAttribute("aria-current", "page");
  for (const route of ["/", "/transactions", "/analysis", "/budgets", "/forecast", "/documents"] as const) {
    await gotoBetaRoute(page, route);
    await assertNoGlobalOverflow(page, `B08 ${route}`);
  }
  await gotoBetaRoute(page, "/");
  await expect(page.getByRole("heading", { name: "Tu dinero, claro en segundos." })).toBeVisible();
  const snapshot = await betaJson(page, "/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=2026-09-30");
  expect(snapshot.status).toBe(200);
  expect(snapshot.body.period.incomeCents).toBeGreaterThan(snapshot.body.period.expenseCents);
  expect(snapshot.body.principles.bankSource).toBe("read_only");
});
