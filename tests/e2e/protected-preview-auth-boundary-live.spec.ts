import { expect, test, type Page } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);

// CR-001D final release gate: this spec is intentionally exercised against the exact protected Preview SHA.
const blockedReadEndpoints = [
  "/api/analysis",
  "/api/budgets?month=2026-09",
  "/api/configuration",
  "/api/documents",
  "/api/forecast?dateFrom=2026-09-01&dateTo=2026-09-30",
  "/api/recurrences",
  "/api/transactions?limit=1",
] as const;

test("protected preview bloquea toda la superficie financiera sin workspace autenticado", async ({ request }) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");

  for (const endpoint of blockedReadEndpoints) {
    const response = await request.get(endpoint);
    expect(response.status(), `${endpoint} debe fallar cerrado sin workspace`).toBe(403);

    const body = await response.json();
    expect(body, `${endpoint} debe conservar el código canónico de frontera de workspace`).toMatchObject({
      code: "workspace_context_required",
    });
    expect(body.error, `${endpoint} debe aportar un error de módulo no vacío`).toEqual(expect.any(String));
    expect(body.error.length, `${endpoint} debe aportar un error de módulo no vacío`).toBeGreaterThan(0);
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

// ---------------------------------------------------------------------------
// CR-006 · PERSONAS SIMULADAS B01–B08 · EVIDENCIA TÉCNICA COMPLEMENTARIA
//
// Esta batería automatizada modela ocho perspectivas de uso sobre la Preview
// aislada de coste 0,00 €. NO constituye beta humana ni sustituye la evidencia
// real exigida por el protocolo maestro de CR-006.
// ---------------------------------------------------------------------------

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
  expect(response, "la entrada /beta debe responder").not.toBeNull();
  expect(response!.status(), "la entrada /beta no puede devolver error").toBeLessThan(400);
  await expect(page).toHaveURL(/\/$/, { timeout: 8_000 });
  await expect(page.locator("main")).toBeVisible({ timeout: 8_000 });

  const cookie = (await page.context().cookies()).find((entry) => entry.name === "financial_app_cr006_beta");
  expect(cookie?.value, "la sesión debe quedar marcada como beta aislada").toBe("1");

  await expect.poll(async () => (await betaJson(page, "/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=2026-09-30")).status, {
    timeout: 8_000,
    message: "el runtime beta debe interceptar la API financiera sin esperar networkidle",
  }).toBe(200);

  const probe = await betaJson(page, "/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=2026-09-30");
  expect(probe.body?.principles?.bankSource).toBe("read_only");
  expect(JSON.stringify(probe.body)).toContain("Demo");
  expect(JSON.stringify(probe.body)).not.toContain("Openbank");
  expect(JSON.stringify(probe.body)).not.toContain("Alberto");
}

async function gotoBetaRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(response, `${route}: debe responder`).not.toBeNull();
  expect(response!.status(), `${route}: no debe devolver error de servidor`).toBeLessThan(500);
  await expect(page.locator("main")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 8_000 });
  return response;
}

async function assertNoGlobalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(Math.max(dimensions.html, dimensions.body), `${label}: no debe existir overflow horizontal global`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function assertVisibleControlsNamed(page: Page, label: string) {
  const unnamed = await page.locator("button, input, select, textarea, a[href]").evaluateAll((elements) =>
    elements.filter((element) => {
      const node = element as HTMLElement;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden") return false;
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      const ariaLabelledBy = element.getAttribute("aria-labelledby")?.trim();
      const title = element.getAttribute("title")?.trim();
      const text = element.textContent?.trim();
      const id = element.getAttribute("id");
      const associatedLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() : "";
      return !(ariaLabel || ariaLabelledBy || title || text || associatedLabel);
    }).length,
  );
  expect(unnamed, `${label}: todo control visible debe conservar nombre accesible`).toBe(0);
}

async function assertTouchTargets(page: Page, label: string) {
  const tooSmall = await page.locator("button, input, select, summary, a[href]").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && rect.height < 44;
    }).length,
  );
  expect(tooSmall, `${label}: los controles visibles deben mantener objetivo táctil >=44 px`).toBe(0);
}

test("CR-006 B01 · persona no técnica recorre acceso, orientación y comprensión básica sin ayuda", async ({ page }) => {
  await activateBeta(page);

  await expect(page.getByRole("heading", { name: "Tu dinero, claro en segundos." })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Navegación principal" });
  for (const label of navLabels) await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();

  await navigation.getByRole("link", { name: "Movimientos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Movimientos", level: 1 })).toBeVisible();
  await expect(page.getByText("CARREFOUR DEMO", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Inicio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tu dinero, claro en segundos." })).toBeVisible();

  const financial = await betaJson(page, "/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=2026-09-30");
  expect(financial.body.period.incomeCents).toBeGreaterThan(0);
  expect(financial.body.period.expenseCents).toBeGreaterThan(0);
  expect(Number.isSafeInteger(financial.body.period.savingsCents)).toBe(true);
  await assertNoGlobalOverflow(page, "B01 Inicio");
  await assertVisibleControlsNamed(page, "B01 Inicio");
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
  await page.getByRole("button", { name: "Fijar límite manual" }).first().click();
  const manual = page.getByLabel("Presupuesto manual de total mensual");
  await manual.fill("1.234,56");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Límite manual guardado");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
  await expect(page.getByText(/Manual · automático/).first()).toBeVisible({ timeout: 8_000 });
  await assertNoGlobalOverflow(page, "B02 Presupuestos");
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

  const budget = await betaJson(page, "/api/budgets?month=2026-09");
  expect(budget.status).toBe(200);
  expect(budget.body.total.effectiveAmountCents).toBeGreaterThan(0);
  expect(budget.body.total.remainingCents).toBe(budget.body.total.effectiveAmountCents - budget.body.total.actualExpenseCents);

  const forecast = await betaJson(page, "/api/forecast?dateFrom=2026-09-12&dateTo=2026-10-12");
  expect(forecast.status).toBe(200);
  expect(forecast.body.summary.projectedClosingBalanceCents).toBe(
    forecast.body.summary.openingBalanceCents + forecast.body.summary.projectedNetCents,
  );

  await gotoBetaRoute(page, "/analysis");
  await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
  await gotoBetaRoute(page, "/forecast");
  await expect(page.getByRole("heading", { name: "Previsión", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Documentos", level: 1 })).toBeVisible();
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
  const skip = page.getByRole("link", { name: "Saltar al contenido principal" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("main-content");

  for (const label of navLabels) {
    const link = page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: label, exact: true });
    await expect(link).toBeVisible();
  }

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
  await assertNoGlobalOverflow(page, "B05 Documentos");
});

test("CR-006 B06 · perfil de accesibilidad cubre teclado, zoom técnico 200 %, reflow 400 %, forced colors y semántica", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "B06 se ejecuta una vez en escritorio");
  test.setTimeout(120_000);
  await activateBeta(page);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido principal" })).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("main-content");
  await assertVisibleControlsNamed(page, "B06 semántica inicial");

  // A03 técnico: 640 CSS px equivale a la anchura efectiva de 1280 px a zoom 200 %.
  await page.setViewportSize({ width: 640, height: 900 });
  for (const route of ["/", "/transactions", "/budgets", "/forecast", "/documents", "/configuration"] as const) {
    await gotoBetaRoute(page, route);
    await assertNoGlobalOverflow(page, `B06 zoom técnico 200 % ${route}`);
    await assertVisibleControlsNamed(page, `B06 semántica 200 % ${route}`);
  }

  // A04 técnico: 320 CSS px equivale al reflow de 400 % sobre 1280 px.
  await page.setViewportSize({ width: 320, height: 900 });
  for (const route of ["/", "/transactions", "/budgets", "/forecast", "/documents", "/configuration"] as const) {
    await gotoBetaRoute(page, route);
    await assertNoGlobalOverflow(page, `B06 reflow 400 % ${route}`);
    await assertVisibleControlsNamed(page, `B06 semántica 400 % ${route}`);
  }

  // A05 técnico: forced colors mantiene controles operables y visibles.
  await page.emulateMedia({ forcedColors: "active" });
  await gotoBetaRoute(page, "/");
  for (const label of ["Movimientos", "Presupuestos", "Previsión", "Documentos"] as const) {
    await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  // A06 técnico: contrato semántico/ARIA observable. No se etiqueta como NVDA/TalkBack humano.
  const semanticLandmarks = await page.locator("nav, main, [role='main'], [role='navigation'], h1").count();
  expect(semanticLandmarks).toBeGreaterThan(0);
  await assertVisibleControlsNamed(page, "B06 contrato semántico equivalente");
});

test("CR-006 B07 · perfil breaker fuerza errores, entradas ambiguas y fronteras fail-closed", async ({ page }) => {
  await activateBeta(page);

  const unknown = await betaJson(page, "/api/cr006-route-that-must-not-exist");
  expect(unknown.status).toBe(503);
  expect(unknown.body).toMatchObject({ error: "cr006_beta_endpoint_not_implemented" });

  const blockedSupabase = await page.evaluate(async () => {
    const response = await fetch("https://example.supabase.co/rest/v1/private");
    return { status: response.status, body: await response.json() };
  });
  expect(blockedSupabase.status).toBe(451);
  expect(blockedSupabase.body).toMatchObject({ error: "cr006_beta_external_persistence_blocked" });

  const blockedGoogle = await page.evaluate(async () => {
    const response = await fetch("https://www.googleapis.com/drive/v3/files");
    return { status: response.status, body: await response.json() };
  });
  expect(blockedGoogle.status).toBe(451);
  expect(blockedGoogle.body).toMatchObject({ error: "cr006_beta_external_persistence_blocked" });

  await gotoBetaRoute(page, "/budgets");
  await page.getByRole("button", { name: "Fijar límite manual" }).first().click();
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
  const navigation = page.getByRole("navigation", { name: "Navegación principal" });

  await navigation.getByRole("link", { name: "Primeros pasos", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(navigation.getByRole("link", { name: "Primeros pasos", exact: true })).toHaveAttribute("aria-current", "page");
  await assertVisibleControlsNamed(page, "B08 Primeros pasos");

  for (const label of ["Inicio", "Movimientos", "Análisis", "Presupuestos", "Previsión", "Documentos"] as const) {
    await navigation.getByRole("link", { name: label, exact: true }).click();
    await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await assertNoGlobalOverflow(page, `B08 ${label}`);
  }

  await navigation.getByRole("link", { name: "Inicio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tu dinero, claro en segundos." })).toBeVisible();
  const snapshot = await betaJson(page, "/api/financial?mode=snapshot&dateFrom=2026-09-01&dateTo=2026-09-30");
  expect(snapshot.status).toBe(200);
  expect(snapshot.body.period.incomeCents).toBeGreaterThan(snapshot.body.period.expenseCents);
  expect(snapshot.body.principles.bankSource).toBe("read_only");
});
