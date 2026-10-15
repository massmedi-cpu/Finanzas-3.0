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

// The real API always returns its version, exact scope, requested sources and
// every data key. Keeping this fixture faithful catches scope/coverage regressions.
function dashboardFixture(
  sources: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    contractVersion: 1,
    scope: "all",
    asOfDate: madridDatePlus(0),
    dataThroughDate: null,
    generatedAt: new Date().toISOString(),
    requestedSources: ["financial", "transactions", "monthly", "budgets", "forecast"],
    failedSources: [],
    data: { financial: null, transactions: null, monthly: null, budgets: null, forecast: null, ...sources },
    ...overrides,
  };
}

async function mockAlerts(page: Page) {
  const upcomingPaymentDate = madridDatePlus(2);

  await page.route("**/api/dashboard?scope=all", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboardFixture({
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
      })),
    });
  });
  await page.route("**/api/source/google/sync", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          status: "success",
          finishedAt: new Date().toISOString(),
          rowsSeen: 25,
          rowsFailed: 0,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
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
    body: JSON.stringify(dashboardFixture({ financial: null, budgets: null, forecast: null })),
  }));
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ run: { status: "success", finishedAt: new Date().toISOString(), rowsSeen: 50, rowsFailed: 0, rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0 } }),
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
  await expect(page.getByRole("heading", { name: "Alertas", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText(/50\.000 documentos sin asociar/)).toBeVisible();
  await expect(page.getByText(/125 documentos pendientes de revisar/)).toBeVisible();
  // Next/React ejecuta de nuevo los efectos al montar en StrictMode de desarrollo:
  // cada lectura sigue realizando exactamente las dos consultas filtradas, nunca páginas N.
  expect([2, 4]).toContain(reads.length);
  expect(reads.every((read) => read.pathname === "/api/documents" && read.limit === "1" && read.method === "GET")).toBe(true);
  expect(reads.filter((read) => read.unassociated === "true" && read.status === null))
    .toHaveLength(reads.length / 2);
  expect(reads.filter((read) => read.unassociated === null && read.status === "pending_review"))
    .toHaveLength(reads.length / 2);
});


test("REC-ALT-001 · cuatro lecturas inválidas no se representan como cero alertas comprobadas", async ({ page }) => {
  const methods: string[] = [];
  await page.route(/\/api\/(?:dashboard\?scope=all|source\/google\/sync|transactions\?uncategorized=true&limit=1|documents\?scope=ordinary&.*)$/, async (route) => {
    methods.push(route.request().method());
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/alerts");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("No se han podido leer las señales de alertas");
  await expect(page.locator('section[aria-label="Resumen de alertas"] strong')).toHaveText(["—", "—", "—"]);
  await expect(page.locator('[class*="sectionHeading"] > strong')).toHaveText("—");
  await expect(page.getByText("No hay alertas activas con las señales disponibles.")).toHaveCount(0);
  expect(methods.length).toBeGreaterThanOrEqual(5);
  expect(methods.every((method) => method === "GET")).toBe(true);
});

test("REC-ALT-002 · dashboard malformado pasa a lectura parcial, preserva las demás alertas y no bloquea", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=all", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ failedSources: null, data: { financial: null, budgets: null, forecast: null } }),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("Lectura parcial: no se pudo consultar resumen financiero");
  await expect(page.getByText("3 movimientos sin categorizar", { exact: true })).toBeVisible();
  await expect(page.getByText("1 documento sin asociar", { exact: true })).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
});

test("REC-ALT-003 · sync 200 corrupta no se clasifica como fuente correcta ni detiene Alertas", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ run: { status: "success", rowsMissing: "0", duplicatesDetected: 0, warningsCount: 0 } }),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("Lectura parcial: no se pudo consultar sincronización");
  await expect(page.getByText("3 movimientos sin categorizar", { exact: true })).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
});

test("REC-ALT-004 · Alertas nunca muestra cifras de otra selección aunque la API responda 200", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=all", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(dashboardFixture({
      financial: {
        period: { operatingNetCents: -200_00, quality: { suspectedDuplicateRows: 9, signMismatchRows: 3 } },
      },
    }, { scope: "primary" })),
  }));
  await page.goto("/alerts");
  await expect(page.getByRole("status")).toContainText("Lectura parcial: no se pudo consultar resumen financiero");
  await expect(page.getByText("El resultado del mes está en negativo")).toHaveCount(0);
  await expect(page.getByText("9 posibles movimientos duplicados")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-005 · una fuente declarada fallida no puede aportar alertas monetarias", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=all", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(dashboardFixture({
      financial: {
        period: { operatingNetCents: -100_00, quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 } },
      },
    }, { failedSources: ["financial"] })),
  }));
  await page.goto("/alerts");
  await expect(page.getByRole("status")).toContainText("Lectura parcial: no se pudo consultar resumen financiero");
  await expect(page.getByText("El resultado del mes está en negativo")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-006 · metadatos de cobertura incompletos no se confunden con ausencia de incidencias", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=all", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      failedSources: [],
      data: { financial: null, transactions: null, monthly: null, budgets: null, forecast: null },
    }),
  }));
  await page.goto("/alerts");
  await expect(page.getByRole("status")).toContainText("Lectura parcial: no se pudo consultar resumen financiero");
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
  await expect(page.getByText("No hay alertas activas con las señales disponibles.")).toHaveCount(0);
});

test("REC-ALT-007 · una sincronización 200 sin finalización comprobable nunca equivale a fuente correcta", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ run: {
      status: "success", finishedAt: null, rowsSeen: 120, rowsFailed: 0,
      rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0,
    } }),
  }));
  await page.goto("/alerts");
  await expect(page.getByRole("status")).toContainText("Lectura parcial: no se pudo consultar sincronización");
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-008 · errores de importación confirmados aparecen en la alerta de fuente", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ run: {
      status: "success", finishedAt: new Date().toISOString(), rowsSeen: 140, rowsFailed: 3,
      rowsMissing: 0, duplicatesDetected: 0, warningsCount: 0,
    } }),
  }));
  await page.goto("/alerts");
  await expect(page.getByText("La última sincronización tiene avisos")).toBeVisible();
  await expect(page.getByText("No se pudieron importar 3 movimientos en la última sincronización.")).toBeVisible();
  await expect(page.getByText("Lectura parcial: no se pudo consultar sincronización")).toHaveCount(0);
});
