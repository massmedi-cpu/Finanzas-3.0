import { expect, test, type Page } from "@playwright/test";

const STATUS_ROUTE = /\/api\/source\/google\/status(?:\?.*)?$/;
const RUNTIME_ROUTE = /\/api\/health\/source-runtime(?:\?.*)?$/;
const SYNC_ROUTE = /\/api\/source\/google\/sync(?:\?.*)?$/;
const PREFLIGHT_ROUTE = /\/api\/source\/google\/preflight(?:\?.*)?$/;

type MockOptions = {
  firstImport?: boolean;
  syncPosts?: string[];
  preflightPosts?: string[];
  finishedAt?: string;
  syncPostError?: boolean;
  authRequired?: boolean;
  networkFailure?: boolean;
  malformedSyncSuccess?: boolean;
  malformedPreflightSuccess?: boolean;
  syncGetRequests?: string[];
};

async function mockSourceOverview(page: Page, options: MockOptions = {}) {
  const syncPosts = options.syncPosts ?? [];
  const preflightPosts = options.preflightPosts ?? [];

  await page.route(STATUS_ROUTE, async (route) => {
    if (options.networkFailure) {
      await route.abort("failed");
      return;
    }
    if (options.authRequired) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "authentication_required" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        authMode: "oauth",
        connection: {
          connected: true,
          accountEmail: "usuario@example.com",
          sourceFileName: "Movimientos bancarios - fuente",
          connectedAt: "2026-09-01T08:00:00.000Z",
          lastVerifiedAt: "2026-10-02T08:00:00.000Z",
          readonly: true,
        },
      }),
    });
  });

  await page.route(RUNTIME_ROUTE, async (route) => {
    if (options.authRequired) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "authentication_required" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", compatible: true }),
    });
  });

  await page.route(PREFLIGHT_ROUTE, async (route) => {
    if (route.request().method() === "POST") preflightPosts.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceFileId: "source-file",
        sourceRevision: "rev-1",
        schemaFingerprint: options.malformedPreflightSuccess ? "invalid" : "a".repeat(64),
        totalAuthoritativeRows: 120,
        accounts: options.malformedPreflightSuccess ? [] : [{
          accountExternalKey: "Cuenta corriente Openbank · 3967",
          accountName: "Cuenta corriente Openbank · 3967",
          accountType: "checking",
          lifecycle: "active",
          authoritativeRows: 120,
          openingBalanceCents: 0,
          newestBankDate: "2026-10-02",
          oldestBankDate: "2025-01-01",
          latestBalanceAfterCents: 1000,
        }],
        cursors: options.malformedPreflightSuccess ? [] : [{
          sourceSheetId: "725351515",
          sheetTitle: "Cuenta corriente · 3967",
          authoritativeRows: 120,
          lastSourceRowKey: "CC-0001",
        }],
      }),
    });
  });

  await page.route(SYNC_ROUTE, async (route) => {
    if (options.authRequired) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "authentication_required" }) });
      return;
    }
    if (route.request().method() === "POST") {
      syncPosts.push(route.request().url());
      if (options.syncPostError) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "gateway_unavailable" }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          syncRunId: "11111111-1111-4111-8111-111111111111",
          rowsSeen: 120,
          rowsInserted: options.malformedSyncSuccess ? "2" : 2,
          rowsRevised: 1,
          rowsSkipped: 117,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
          cursorsAdvanced: 1,
        }),
      });
      return;
    }

    options.syncGetRequests?.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: options.firstImport ? null : {
          id: "run-1",
          sourceFileId: "source-file",
          sourceRevision: "rev-1",
          status: "success",
          startedAt: options.finishedAt
            ? new Date(Date.parse(options.finishedAt) - 60_000).toISOString()
            : "2026-10-02T07:55:00.000Z",
          finishedAt: options.finishedAt ?? "2026-10-02T08:00:00.000Z",
          rowsSeen: 120,
          rowsInserted: 0,
          rowsRevised: 0,
          rowsSkipped: 120,
          rowsFailed: 0,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
          errorCode: null,
          errorMessage: null,
        },
        cursors: options.firstImport ? [] : [{ sourceSheetId: "sheet-1" }],
      }),
    });
  });
}

test("Fuente bancaria prioriza estado y acciones y relega el diagnóstico técnico", async ({ page }) => {
  await mockSourceOverview(page);
  await page.goto("/configuration/source");

  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Fuente bancaria", level: 1 })).toBeVisible();
  await expect(page.getByText("Movimientos bancarios - fuente")).toBeVisible();
  await expect(page.getByText("Fuente conectada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Detalles técnicos" })).toHaveAttribute("href", "/configuration/source/diagnostics");
  await expect(page.getByText("Google se utiliza únicamente en modo lectura.")).toBeVisible();

  await expect(page.getByText("PREVALIDACIÓN READ-ONLY")).toHaveCount(0);
  await expect(page.getByText("Pestañas físicas")).toHaveCount(0);
  await expect(page.getByText("Revisión fuente")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test("actualización con histórico exige preflight y un solo sync", async ({ page }) => {
  const syncPosts: string[] = [];
  const preflightPosts: string[] = [];
  await mockSourceOverview(page, { syncPosts, preflightPosts });
  await page.goto("/configuration/source");

  await page.getByRole("button", { name: "Actualizar desde Google" }).click();
  await expect.poll(() => syncPosts.length).toBe(1);
  expect(preflightPosts).toHaveLength(1);
  await expect(page.getByRole("status").filter({ hasText: "3 cambios incorporados" })).toBeVisible();
});

test("la primera importación conserva la comprobación previa antes de sincronizar", async ({ page }) => {
  const syncPosts: string[] = [];
  const preflightPosts: string[] = [];
  await mockSourceOverview(page, { firstImport: true, syncPosts, preflightPosts });
  await page.goto("/configuration/source");

  await expect(page.getByText("Primera actualización protegida")).toBeVisible();
  await page.getByRole("button", { name: "Actualizar desde Google" }).click();

  await expect.poll(() => preflightPosts.length).toBe(1);
  await expect.poll(() => syncPosts.length).toBe(1);
  await expect(page.getByRole("status").filter({ hasText: "3 cambios incorporados" })).toBeVisible();
});

test("Detalles técnicos conserva la superficie de diagnóstico avanzada", async ({ page }) => {
  await mockSourceOverview(page);
  await page.goto("/configuration/source/diagnostics");

  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Fuente bancaria", level: 1 })).toBeVisible();
  await expect(page.getByText("TRAZABILIDAD", { exact: true })).toBeVisible();
  await expect(page.getByText("Pestañas físicas", { exact: true })).toBeVisible();
});


test("REC-SYNC-195 · Fuente bancaria no acredita actualidad con un recibo antiguo", async ({ page }) => {
  await mockSourceOverview(page);
  await page.goto("/configuration/source");
  const state = page.getByRole("group", { name: "Resumen de la fuente bancaria" });
  await expect(state).toContainText("Pendiente de comprobar");
  await expect(state).not.toContainText("Al día");
  await expect(page.getByRole("status").filter({ hasText: "Comprueba la actualización" })).toContainText("más de 48 horas");
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeVisible();
});

test("REC-SYNC-196 · Fuente bancaria distingue una comprobación reciente", async ({ page }) => {
  await mockSourceOverview(page, { finishedAt: new Date(Date.now() - 60_000).toISOString() });
  await page.goto("/configuration/source");
  await expect(page.getByRole("group", { name: "Resumen de la fuente bancaria" })).toContainText("Comprobación reciente");
  await expect(page.getByRole("status").filter({ hasText: "Comprueba la actualización" })).toHaveCount(0);
});


test("REC-SYNC-199 · un POST sin respuesta concluyente no se reintenta ni promete rollback", async ({ page }) => {
  const syncPosts: string[] = [];
  const syncGetRequests: string[] = [];
  await mockSourceOverview(page, { syncPosts, syncGetRequests, syncPostError: true });
  await page.goto("/configuration/source");
  const updateButton = page.getByRole("button", { name: "Actualizar desde Google" });
  await expect(updateButton).toBeEnabled();
  // React may issue two identical mount-time GETs in dev/StrictMode.
  // Verify exactly one EXTRA persisted-status GET after the failed POST.
  const initialStatusReads = syncGetRequests.length;
  await updateButton.click();
  const error = page.locator(".config-message.error");
  await expect(error).toContainText("No se ha podido confirmar el resultado de la actualización");
  await expect(error).toContainText("antes de repetirla");
  await expect(error).not.toContainText("datos existentes siguen intactos");
  await expect.poll(() => syncGetRequests.length).toBe(initialStatusReads + 1);
  expect(syncPosts).toHaveLength(1);
  await expect(page.getByRole("status").filter({ hasText: "Actualización completada" })).toHaveCount(0);
});


test("REC-SYNC-200 · una respuesta de preflight HTTP 200 malformada bloquea la primera importación", async ({ page }) => {
  const syncPosts: string[] = [];
  const preflightPosts: string[] = [];
  await mockSourceOverview(page, { firstImport: true, malformedPreflightSuccess: true, syncPosts, preflightPosts });
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Actualizar desde Google" }).click();
  await expect(page.locator(".config-message.error")).toContainText("No se ha iniciado la importación");
  expect(preflightPosts).toHaveLength(1);
  expect(syncPosts).toHaveLength(0);
  await expect(page.getByRole("status").filter({ hasText: "Actualización completada" })).toHaveCount(0);
});

test("REC-SYNC-201 · la respuesta de sync HTTP 200 con contadores inválidos no inventa éxito", async ({ page }) => {
  const syncPosts: string[] = [];
  const syncGetRequests: string[] = [];
  await mockSourceOverview(page, { malformedSyncSuccess: true, syncPosts, syncGetRequests });
  await page.goto("/configuration/source");
  const updateButton = page.getByRole("button", { name: "Actualizar desde Google" });
  await expect(updateButton).toBeEnabled();
  const initialStatusReads = syncGetRequests.length;
  await updateButton.click();
  await expect(page.locator(".config-message.error")).toContainText("No se puede confirmar la actualización");
  await expect.poll(() => syncGetRequests.length).toBe(initialStatusReads + 1);
  expect(syncPosts).toHaveLength(1);
  await expect(page.getByRole("status").filter({ hasText: "Actualización completada" })).toHaveCount(0);
});


test("REC-AUTH-204 · la fuente bancaria ofrece acceso sin revelar metadatos al usuario anónimo", async ({ page }) => {
  await mockSourceOverview(page, { authRequired: true });
  await page.goto("/configuration/source");
  await expect(page.locator(".config-message.error[role=alert]")).toContainText("Inicia sesión para consultar la fuente bancaria.");
  await expect(page.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login?next=%2Fconfiguration%2Fsource");
  await expect(page.getByText("Movimientos bancarios - fuente")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeDisabled();
});


for (const sourcePage of ["/configuration/source", "/configuration/source/diagnostics"]) {
  test(`REC-AUTH-211 · ${sourcePage} oculta estado anterior si la sesión caduca`, async ({ page }) => {
    const options: MockOptions = { finishedAt: new Date(Date.now() - 60_000).toISOString() };
    await mockSourceOverview(page, options);
    await page.goto(sourcePage);
    const update = page.getByRole("button", { name: "Actualizar desde Google" });
    await expect(update).toBeEnabled();
    options.authRequired = true;
    await page.getByRole("button", { name: "Comprobar estado" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Inicia sesión para consultar la fuente bancaria." })).toBeVisible();
    await expect(update).toBeDisabled();
    await expect(page.getByText("Movimientos bancarios - fuente")).toHaveCount(0);
  });

  test(`REC-AUTH-212 · ${sourcePage} falla cerrado tras perder la red`, async ({ page }) => {
    const options: MockOptions = { finishedAt: new Date(Date.now() - 60_000).toISOString() };
    await mockSourceOverview(page, options);
    await page.goto(sourcePage);
    const update = page.getByRole("button", { name: "Actualizar desde Google" });
    await expect(update).toBeEnabled();
    options.networkFailure = true;
    await page.getByRole("button", { name: "Comprobar estado" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No se ha podido leer el estado de la fuente bancaria." })).toBeVisible();
    await expect(update).toBeDisabled();
    await expect(page.getByText("Movimientos bancarios - fuente")).toHaveCount(0);
  });
}


test("REC-AUTH-213 · callback Google no anuncia conexión tras sesión caducada", async ({ page }) => {
  await mockSourceOverview(page, { authRequired: true });
  await page.goto("/configuration/source/diagnostics?google=connected");
  await expect(page.getByRole("alert").filter({ hasText: "Inicia sesión para consultar la fuente bancaria." })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Google se ha conectado" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeDisabled();
});

test("REC-AUTH-214 · callback Google conserva éxito si la conexión está comprobada", async ({ page }) => {
  await mockSourceOverview(page);
  await page.goto("/configuration/source/diagnostics?google=connected");
  await expect(page.getByRole("status").filter({ hasText: "Google se ha conectado" })).toBeVisible();
});

test("REC-SYNC-239 · preflight inválido bloquea sync con histórico existente", async ({ page }) => {
  const syncPosts: string[] = [];
  const preflightPosts: string[] = [];
  await mockSourceOverview(page, { malformedPreflightSuccess: true, syncPosts, preflightPosts });
  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Actualizar desde Google" }).click();
  await expect(page.locator(".config-message.error")).toContainText("No se ha iniciado la importación");
  expect(preflightPosts).toHaveLength(1);
  expect(syncPosts).toHaveLength(0);
});
