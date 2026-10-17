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
const documentPrinciples = {
  bankSource: "read_only", ocrEnabled: true,
  getHasSideEffects: false, suggestionsPersisted: false, associationsRequireConfirmation: true,
};

function dashboardFixture(
  sources: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  const day = madridDatePlus(0);
  const data: Record<string, unknown> = {
    financial: null, transactions: null, monthly: null, budgets: null, forecast: null, ...sources,
  };
  if (data.financial && typeof data.financial === "object") {
    const financial = data.financial as Record<string, unknown>;
    const period = financial.period as Record<string, unknown>;
    const net = period.operatingNetCents as number;
    data.financial = {
      ...financial,
      period: {
        dateFrom: `${day.slice(0, 7)}-01`, dateTo: day,
        incomeCents: Math.max(0, net), expenseCents: Math.max(0, -net),
        ...period,
      },
    };
  }
  if (data.budgets && typeof data.budgets === "object") {
    const budgets = data.budgets as Record<string, unknown>;
    const categories = (budgets.categories as Record<string, unknown>[]).map((item) => {
      const effective = 100_000;
      const spent = Math.round((item.progressBps as number) * 10);
      return {
        effectiveAmountCents: effective,
        actualExpenseCents: spent,
        remainingCents: effective - spent,
        ...item,
      };
    });
    data.budgets = {
      month: day.slice(0, 7),
      total: {
        effectiveAmountCents: 500_000, actualExpenseCents: 0,
        remainingCents: 500_000, progressBps: 0, status: "on_track",
      },
      ...budgets, categories,
    };
  }
  if (data.forecast && typeof data.forecast === "object") {
    const forecast = data.forecast as Record<string, unknown>;
    const summary = forecast.summary as Record<string, unknown>;
    const items = forecast.items as Array<Record<string, unknown>>;
    const planned = items.filter((item) => item.status === "planned" && item.affectsProjection);
    const income = planned.reduce((sum, item) => sum + Math.max(0, item.amountCents as number), 0);
    const expense = planned.reduce((sum, item) => sum - Math.min(0, item.amountCents as number), 0);
    data.forecast = {
      ...forecast,
      period: forecast.period ?? { dateFrom: day, dateTo: madridDatePlus(30), accountId: null },
      summary: {
        openingBalanceCents: (summary.projectedClosingBalanceCents as number) - income + expense,
        projectedIncomeCents: income,
        projectedExpenseCents: expense,
        projectedNetCents: income - expense,
        ...summary,
      },
    };
  }
  return {
    contractVersion: 1,
    scope: "alerts",
    asOfDate: day,
    dataThroughDate: null,
    generatedAt: new Date().toISOString(),
    requestedSources: ["financial", "budgets", "forecast"],
    failedSources: [],
    data,
    ...overrides,
  };
}

function healthyFreshness() {
  const today = madridDatePlus(0);
  return {
    available: true,
    earliestMovementDate: `${today.slice(0, 7)}-01`,
    latestMovementDate: today,
    sync: {
      status: "success",
      startedAt: null,
      finishedAt: new Date().toISOString(),
      rowsSeen: 150,
      rowsFailed: 0,
      rowsMissing: 0,
      duplicatesDetected: 0,
      warningsCount: 0,
    },
  };
}

async function mockAlerts(page: Page) {
  const upcomingPaymentDate = madridDatePlus(2);
  await page.route("**/api/analysis/source-freshness", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(healthyFreshness()),
  }));

  await page.route("**/api/dashboard?scope=alerts", async (route) => {
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
              { id: "f0000000-0000-4000-8000-000000000001", date: upcomingPaymentDate, concept: "Recibo", amountCents: -35_00, status: "planned", affectsProjection: true },
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
      body: JSON.stringify({ contractVersion: 3, total: 1, limit: 1, offset: 0, items: [{ id: "verified-document" }], principles: documentPrinciples }),
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
  await page.route("**/api/analysis/source-freshness", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(healthyFreshness()),
  }));
  const reads: Array<{ pathname: string; status: string | null; unassociated: string | null; limit: string | null; method: string }> = [];
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
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
      body: JSON.stringify({ contractVersion: 3, total: url.searchParams.get("unassociated") === "true" ? 50_000 : 125, limit: 1, offset: 0, items: [{ id: "verified-document" }], principles: documentPrinciples }),
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


test("REC-ALT-001 · cinco fuentes inválidas no se representan como cero alertas comprobadas", async ({ page }) => {
  const methods: string[] = [];
  await page.route(/\/api\/(?:dashboard\?scope=alerts|source\/google\/sync|analysis\/source-freshness|transactions\?uncategorized=true&limit=1|documents\?scope=ordinary&.*)$/, async (route) => {
    methods.push(route.request().method());
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/alerts");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("No se han podido leer las señales de alertas");
  await expect(page.locator('section[aria-label="Resumen de alertas"] strong')).toHaveText(["—", "—", "—"]);
  await expect(page.locator('[class*="sectionHeading"] > strong')).toHaveText("—");
  await expect(page.getByText("No hay alertas activas con las señales disponibles.")).toHaveCount(0);
  expect(methods.length).toBeGreaterThanOrEqual(6);
  expect(methods.every((method) => method === "GET")).toBe(true);
});

test("REC-ALT-002 · dashboard malformado pasa a lectura parcial, preserva las demás alertas y no bloquea", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
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
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
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
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
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
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
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

test("REC-ALT-011 · sin cobertura bancaria, Alertas no muestra una falsa desviación mensual", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/analysis/source-freshness", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      ...healthyFreshness(),
      available: false,
      earliestMovementDate: null,
      latestMovementDate: null,
      sync: null,
    }),
  }));
  await page.goto("/alerts");
  await expect(page.getByText("1 presupuesto cerca del límite")).toHaveCount(0);
  await expect(page.getByText("El resultado del mes está en negativo")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-012 · fuente no disponible, sin falsas cifras pero con avisos financieros no dependientes de cobertura", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/analysis/source-freshness", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "source_unavailable" }),
  }));
  await page.goto("/alerts");
  await expect(page.getByRole("status")).toContainText("Lectura parcial: no se pudo consultar cobertura bancaria");
  await expect(page.getByText("2 posibles movimientos duplicados")).toBeVisible();
  await expect(page.getByText("1 presupuesto cerca del límite")).toHaveCount(0);
  await expect(page.getByText("El resultado del mes está en negativo")).toHaveCount(0);
});

test("REC-ALT-013 · snapshot de otro mes no genera alertas con cifras actuales", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(dashboardFixture({
      financial: {
        period: {
          dateFrom: "2026-09-01", dateTo: "2026-09-30", operatingNetCents: -100000,
          quality: { suspectedDuplicateRows: 8, signMismatchRows: 0 },
        },
      },
    })),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("resumen financiero");
  await expect(page.getByText("El resultado del mes está en negativo")).toHaveCount(0);
  await expect(page.getByText("8 posibles movimientos duplicados")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-014 · presupuesto de otro mes no puede declarar límites alcanzados", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(dashboardFixture({
      budgets: { month: "2026-09", categories: [{ categoryName: "Ocio", progressBps: 10500, status: "over" }] },
    })),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("resumen financiero");
  await expect(page.getByText("1 presupuesto superado")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-015 · documentos legados 200 no acreditan los filtros Pruebas y sin asociar", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/documents?scope=ordinary&*", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ contractVersion: 2, total: 9999, limit: 1, offset: 0, items: [], principles: documentPrinciples }),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("documentos");
  await expect(page.getByText(/9\.999 documentos sin asociar/)).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-017 · HTTP 200 con neto mensual inconsistente no crea un falso déficit", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(dashboardFixture({
      financial: { period: {
        operatingNetCents: -500_00, incomeCents: 200_00, expenseCents: 100_00,
        quality: { suspectedDuplicateRows: 15, signMismatchRows: 0 },
      } },
    })),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("resumen financiero");
  await expect(page.getByText("El resultado del mes está en negativo")).toHaveCount(0);
  await expect(page.getByText("15 posibles movimientos duplicados")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-018 · presupuesto incoherente no afirma que se superó el límite", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(dashboardFixture({
      budgets: { categories: [{
        categoryName: "Ocio", progressBps: 12000, status: "over",
        effectiveAmountCents: 100_00, actualExpenseCents: 125_00, remainingCents: 0,
      }] },
    })),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("resumen financiero");
  await expect(page.getByText("1 presupuesto superado")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-019 · saldo futuro aritméticamente contradictorio nunca se anuncia como riesgo confirmado", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(dashboardFixture({
      forecast: {
        summary: {
          openingBalanceCents: 500_00, projectedIncomeCents: 0,
          projectedExpenseCents: 100_00, projectedNetCents: -100_00,
          projectedClosingBalanceCents: -10_00, plannedItems: 1,
        },
        items: [{
          id: "f0000000-0000-4000-8000-000000000002", date: madridDatePlus(1),
          concept: "Cuota", amountCents: -100_00, status: "planned", affectsProjection: true,
        }],
      },
    })),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("resumen financiero");
  await expect(page.getByText("La previsión termina con saldo negativo")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-020 · una previsión de cuenta y fechas ajenas no contamina las alertas del día", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(dashboardFixture({
      forecast: {
        period: {
          dateFrom: madridDatePlus(-30), dateTo: madridDatePlus(-1),
          accountId: "a0000000-0000-4000-8000-000000000001",
        },
        summary: { projectedClosingBalanceCents: -300_00, plannedItems: 0 },
        items: [],
      },
    })),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("resumen financiero");
  await expect(page.getByText("La previsión termina con saldo negativo")).toHaveCount(0);
});

test("REC-ALT-021 · respuesta documental de lectura no segura se excluye incluso con versión 3", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/documents?scope=ordinary&*", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      contractVersion: 3, total: 9000, limit: 1, offset: 0, items: [],
      principles: { ...documentPrinciples, bankSource: "read_write" },
    }),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("documentos");
  await expect(page.getByText(/9\.000 documentos sin asociar/)).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-022 · un recuento documental fallido no borra el otro que sí está confirmado", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/documents?scope=ordinary&*", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("status") === "pending_review") {
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' });
    }
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 3, total: 7, limit: 1, offset: 0, items: [{ id: "verified-document" }],
        principles: documentPrinciples,
      }),
    });
  });
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("documentos");
  await expect(page.getByText("7 documentos sin asociar")).toBeVisible();
  await expect(page.getByText("1 documento pendiente de revisar")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-023 · resumen de ayer HTTP 200 no puede presentarse como el mes actualizado", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/dashboard?scope=alerts", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(dashboardFixture({
      financial: {
        period: {
          operatingNetCents: -800_00,
          quality: { suspectedDuplicateRows: 9, signMismatchRows: 0 },
        },
      },
    }, { asOfDate: madridDatePlus(-1) })),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("resumen financiero");
  await expect(page.getByText("El resultado del mes está en negativo")).toHaveCount(0);
  await expect(page.getByText("9 posibles movimientos duplicados")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-024 · sincronización parcial se muestra como aviso y detalla los movimientos fallidos", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/source/google/sync", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ run: {
      status: "partial", finishedAt: new Date().toISOString(),
      rowsSeen: 75, rowsFailed: 5, rowsMissing: 0,
      duplicatesDetected: 0, warningsCount: 1,
    } }),
  }));
  await page.goto("/alerts");
  await expect(page.getByText("La última sincronización tiene avisos")).toBeVisible();
  await expect(page.getByText(/La actualización quedó incompleta/)).toBeVisible();
  await expect(page.getByText(/No se pudieron importar 5 movimientos/)).toBeVisible();
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toHaveCount(0);
});

test("REC-ALT-025 · cobertura bancaria válida pero incompleta se anuncia sin falso cero", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/analysis/source-freshness", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      ...healthyFreshness(), available: false,
      earliestMovementDate: null, latestMovementDate: null, sync: null,
    }),
  }));
  await page.goto("/alerts");
  await expect(page.getByRole("status")).toContainText("La cobertura bancaria del mes es insuficiente");
  await expect(page.getByText("El resultado del mes está en negativo")).toHaveCount(0);
  await expect(page.getByText("1 presupuesto cerca del límite")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-026 · una lista 200 truncada no inventa documentos pendientes", async ({ page }) => {
  await mockAlerts(page);
  await page.route("**/api/documents?scope=ordinary&*", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      contractVersion: 3, total: 140, limit: 1, offset: 0,
      items: [], principles: documentPrinciples,
    }),
  }));
  await page.goto("/alerts");
  await expect(page.locator('[class*="partialNotice"][role="status"]')).toContainText("documentos");
  await expect(page.getByText("140 documentos sin asociar")).toHaveCount(0);
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
});

test("REC-ALT-027 · solo solicita tres fuentes, sin escaneos mensuales ni actividad duplicada", async ({ page }) => {
  await mockAlerts(page);
  const called: string[] = [];
  await page.route("**/api/dashboard?scope=alerts", async (route) => {
    called.push(new URL(route.request().url()).searchParams.get("scope") ?? "");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(dashboardFixture({
        financial: { period: {
          operatingNetCents: 0, quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
        } },
      })),
    });
  });
  await page.goto("/alerts");
  await expect(page.getByRole("heading", { name: "Alertas", exact: true })).toBeVisible();
  await expect(page.getByText("3 movimientos sin categorizar")).toBeVisible();
  expect(called.length).toBeGreaterThan(0);
  expect(called.every((scope) => scope === "alerts")).toBe(true);
});


test("REC-UI-ALERT-013 · señales legibles en claro/oscuro y accesibles en móvil/escritorio", async ({ page }) => {
  await mockAlerts(page);
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/alerts");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const list = page.locator('section[aria-labelledby="active-alerts-title"]');
    const alert = list.locator("article").filter({ hasText: "1 documento sin asociar" });
    await expect(alert).toBeVisible();
    const checkedAt = page.getByText("Última comprobación:", { exact: false });
    await expect(checkedAt).toBeVisible();
    await expect(checkedAt.locator("time")).toHaveAttribute("datetime", /T/);
    const details = alert.locator("details");
    await expect(details).not.toHaveAttribute("open");
    await details.locator("summary").click();
    await expect(details).toContainText("Índice de prioridad 68");
    await details.locator("summary").click();
    for (const width of [360, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      const values = await alert.evaluate((node) => {
        const paragraph = node.querySelector("p");
        const action = node.querySelector("a");
        if (!paragraph || !action) throw new Error("incomplete_alert_card");
        return {
          paragraphColor: getComputedStyle(paragraph).color,
          secondaryColor: getComputedStyle(document.documentElement).getPropertyValue("--color-text-secondary").trim(),
          actionHeight: action.getBoundingClientRect().height,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(values.paragraphColor).toMatch(/^rgb\(/);
      expect(values.secondaryColor).not.toBe("");
      expect(values.actionHeight).toBeGreaterThanOrEqual(44);
      expect(values.overflow).toBeLessThanOrEqual(1);
    }
  }
});
