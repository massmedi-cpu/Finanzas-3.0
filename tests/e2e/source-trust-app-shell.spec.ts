import { expect, test, type Page, type Route } from "@playwright/test";

type SourcePayload = {
  available: boolean;
  latestMovementDate: string | null;
  sync: null | {
    status: "success" | "partial" | "failed" | "started";
    finishedAt: string | null;
    startedAt: string | null;
    rowsSeen: number | null;
    rowsFailed: number | null;
    rowsMissing: number | null;
    duplicatesDetected: number | null;
    warningsCount: number | null;
  };
};

const successPayload: SourcePayload = {
  available: true,
  latestMovementDate: "2026-09-27",
  sync: {
    status: "success",
    finishedAt: "2026-09-28T10:15:00.000Z",
    startedAt: "2026-09-28T10:14:00.000Z",
    rowsSeen: 1248,
    rowsFailed: 0,
    rowsMissing: 0,
    duplicatesDetected: 0,
    warningsCount: 0,
  },
};

const guardedRoutes = [
  "/accounts",
  "/transactions",
  "/budgets",
  "/cash-flow",
  "/forecast",
  "/recurrences",
  "/documents",
] as const;

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function isolateData(page: Page, sourceResponse: SourcePayload | null, sourceStatus = 200) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/build") {
      await route.continue();
      return;
    }
    if (url.pathname === "/api/analysis/source-freshness") {
      await fulfillJson(route, sourceStatus, sourceResponse ?? { error: "source_unavailable" });
      return;
    }
    await fulfillJson(route, 503, { error: "source_trust_gate_data_isolated" });
  });
}

function sourceRegion(page: Page) {
  return page.getByRole("region", { name: "Estado de la fuente bancaria" });
}

test("10.0.29 · muestra fuente comprobada con cifras exactas en Movimientos", async ({ page }) => {
  await isolateData(page, successPayload);
  await page.goto("/transactions");
  const region = sourceRegion(page);
  await expect(region).toBeVisible();
  await expect(region.getByRole("status")).toContainText("Fuente comprobada");
  await expect(region.getByRole("status")).toContainText("1.248 filas revisadas");
  await expect(region.getByRole("link", { name: "Revisar fuente" })).toHaveCount(0);
});

test("10.0.29 · cubre Cuentas, Movimientos, Presupuestos, Cash Flow, Previsión, Recurrentes y Documentos", async ({ page }) => {
  await isolateData(page, successPayload);
  for (const path of guardedRoutes) {
    await page.goto(path);
    await expect(sourceRegion(page), `estado transversal ausente en ${path}`).toBeVisible();
    await expect(sourceRegion(page).getByRole("status")).toContainText("Fuente comprobada");
  }
});

test("10.0.29 · no duplica el control dedicado de Análisis", async ({ page }) => {
  await isolateData(page, successPayload);
  await page.goto("/analysis");
  await expect(sourceRegion(page)).toHaveCount(0);
});

test("10.0.29 · no invade Inicio ni módulos fuera del alcance", async ({ page }) => {
  await isolateData(page, successPayload);
  for (const path of ["/", "/review", "/compare", "/configuration"]) {
    await page.goto(path);
    await expect(sourceRegion(page), `el estado transversal no debe aparecer en ${path}`).toHaveCount(0);
  }
});

test("10.0.29 · falla cerrado cuando el endpoint responde 503", async ({ page }) => {
  await isolateData(page, null, 503);
  await page.goto("/transactions");
  const region = sourceRegion(page);
  await expect(region.getByRole("status")).toContainText("Fuente no comprobable");
  await expect(region.getByRole("status")).toContainText("No se asume que esté actualizada");
  await expect(region.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(region.getByRole("link", { name: "Revisar fuente" })).toBeVisible();
});

test("10.0.29 · falla cerrado ante un payload inválido", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/build") return route.continue();
    if (url.pathname === "/api/analysis/source-freshness") return fulfillJson(route, 200, { available: "yes" });
    return fulfillJson(route, 503, { error: "isolated" });
  });
  await page.goto("/accounts");
  await expect(sourceRegion(page).getByRole("status")).toContainText("Fuente no comprobable");
});

test("10.0.29 · reintenta y recupera confianza sin recargar la página", async ({ page }) => {
  let sourceRequests = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/build") return route.continue();
    if (url.pathname === "/api/analysis/source-freshness") {
      sourceRequests += 1;
      return sourceRequests === 1
        ? fulfillJson(route, 503, { error: "temporary" })
        : fulfillJson(route, 200, successPayload);
    }
    return fulfillJson(route, 503, { error: "isolated" });
  });

  await page.goto("/forecast");
  const region = sourceRegion(page);
  await expect(region.getByRole("status")).toContainText("Fuente no comprobable");
  await region.getByRole("button", { name: "Reintentar" }).click();
  await expect(region.getByRole("status")).toContainText("Fuente comprobada");
  expect(sourceRequests).toBeGreaterThanOrEqual(2);
});

test("10.0.29 · conserva las incidencias y sus cifras exactas", async ({ page }) => {
  const incidentPayload: SourcePayload = {
    ...successPayload,
    sync: {
      ...successPayload.sync!,
      status: "failed",
      rowsSeen: 90,
      rowsFailed: 2,
      rowsMissing: 3,
      duplicatesDetected: 1,
      warningsCount: 5,
    },
  };
  await isolateData(page, incidentPayload);
  await page.goto("/budgets");
  const status = sourceRegion(page).getByRole("status");
  await expect(status).toContainText("Fuente con incidencias");
  await expect(status).toContainText("90 filas revisadas");
  await expect(status).toContainText("2 filas no procesadas");
  await expect(status).toContainText("3 movimientos ausentes");
  await expect(status).toContainText("1 posible duplicado");
  await expect(status).toContainText("2 avisos adicionales");
});

test("10.0.29 · diferencia una sincronización parcial", async ({ page }) => {
  const partialPayload: SourcePayload = {
    ...successPayload,
    sync: { ...successPayload.sync!, status: "partial", rowsFailed: 1 },
  };
  await isolateData(page, partialPayload);
  await page.goto("/cash-flow");
  await expect(sourceRegion(page).getByRole("status")).toContainText("Fuente sincronizada parcialmente");
  await expect(sourceRegion(page).getByRole("link", { name: "Revisar fuente" })).toBeVisible();
});

test("10.0.29 · comunica actualización en curso sin afirmar que los datos estén al día", async ({ page }) => {
  const startedPayload: SourcePayload = {
    ...successPayload,
    sync: { ...successPayload.sync!, status: "started", finishedAt: null },
  };
  await isolateData(page, startedPayload);
  await page.goto("/recurrences");
  const status = sourceRegion(page).getByRole("status");
  await expect(status).toContainText("Fuente actualizándose");
  await expect(status).not.toContainText("Fuente comprobada");
});

test("10.0.29 · un available=false se trata como no comprobable", async ({ page }) => {
  await isolateData(page, { available: false, latestMovementDate: null, sync: null });
  await page.goto("/documents");
  const status = sourceRegion(page).getByRole("status");
  await expect(status).toContainText("Fuente no comprobable");
  await expect(status).toContainText("No hay evidencia suficiente");
});

test("10.0.29 · el estado es usable a 320 px, sin overflow y con acciones táctiles", async ({ page }) => {
  await isolateData(page, null, 503);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/transactions");
  const region = sourceRegion(page);
  await expect(region).toBeVisible();
  for (const control of [
    region.getByRole("button", { name: "Reintentar" }),
    region.getByRole("link", { name: "Revisar fuente" }),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
