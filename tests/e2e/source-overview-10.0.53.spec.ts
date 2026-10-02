import { expect, test, type Page } from "@playwright/test";

const STATUS_ROUTE = /\/api\/source\/google\/status(?:\?.*)?$/;
const RUNTIME_ROUTE = /\/api\/health\/source-runtime(?:\?.*)?$/;
const SYNC_ROUTE = /\/api\/source\/google\/sync(?:\?.*)?$/;
const PREFLIGHT_ROUTE = /\/api\/source\/google\/preflight(?:\?.*)?$/;

type MockOptions = {
  firstImport?: boolean;
  syncPosts?: string[];
  preflightPosts?: string[];
};

async function mockSourceOverview(page: Page, options: MockOptions = {}) {
  const syncPosts = options.syncPosts ?? [];
  const preflightPosts = options.preflightPosts ?? [];

  await page.route(STATUS_ROUTE, async (route) => {
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
        schemaFingerprint: "safe",
        totalAuthoritativeRows: 120,
        accounts: [],
        cursors: [],
      }),
    });
  });

  await page.route(SYNC_ROUTE, async (route) => {
    if (route.request().method() === "POST") {
      syncPosts.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          rowsInserted: 2,
          rowsRevised: 1,
          rowsSkipped: 117,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: options.firstImport ? null : {
          id: "run-1",
          sourceFileId: "source-file",
          sourceRevision: "rev-1",
          status: "success",
          startedAt: "2026-10-02T07:55:00.000Z",
          finishedAt: "2026-10-02T08:00:00.000Z",
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

test("una actualización explícita ejecuta una sola sincronización cuando ya existe histórico", async ({ page }) => {
  const syncPosts: string[] = [];
  const preflightPosts: string[] = [];
  await mockSourceOverview(page, { syncPosts, preflightPosts });
  await page.goto("/configuration/source");

  await page.getByRole("button", { name: "Actualizar desde Google" }).click();
  await expect.poll(() => syncPosts.length).toBe(1);
  expect(preflightPosts).toHaveLength(0);
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
