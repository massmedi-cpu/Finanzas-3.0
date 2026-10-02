import { expect, test, type Route } from "@playwright/test";

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("10.0.53 · Fuente prioriza estado y acciones y oculta diagnóstico técnico hasta solicitarlo", async ({ page }) => {
  await page.route("**/api/source/google/status", async (route) => json(route, {
    configured: true,
    authMode: "service-account",
    connection: {
      connected: true,
      accountEmail: "financial-app-reader@example.test",
      sourceFileName: "Movimientos bancarios - fuente",
      connectedAt: "2026-09-01T08:00:00.000Z",
      lastVerifiedAt: "2026-10-02T08:00:00.000Z",
      readonly: true,
      managed: true,
    },
  }));

  await page.route("**/api/health/source-runtime", async (route) => json(route, {
    status: "ok",
    compatible: true,
  }));

  await page.route("**/api/source/google/sync", async (route) => {
    if (route.request().method() !== "GET") return json(route, { error: "unexpected_write" }, 500);
    return json(route, {
      run: {
        id: "sync-1",
        sourceFileId: "source-file",
        sourceRevision: "rev-20261002",
        status: "success",
        startedAt: "2026-10-02T07:59:00.000Z",
        finishedAt: "2026-10-02T08:00:00.000Z",
        rowsSeen: 1200,
        rowsInserted: 4,
        rowsRevised: 1,
        rowsSkipped: 1195,
        rowsFailed: 0,
        rowsMissing: 0,
        duplicatesDetected: 0,
        warningsCount: 0,
        errorCode: null,
      },
      cursors: [{
        sourceFileId: "source-file",
        sourceSheetId: "sheet-1",
        sourceRevision: "rev-20261002",
        lastSourceRowKey: "ROW-1200",
        lastSuccessfulRunId: "sync-1",
        updatedAt: "2026-10-02T08:00:00.000Z",
      }],
    });
  });

  await page.goto("/configuration/source");

  await expect(page.getByRole("heading", { name: "Fuente bancaria", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tu fuente de datos", level: 2 })).toBeVisible();
  await expect(page.getByText("Conexión", { exact: true })).toBeVisible();
  await expect(page.getByText("Última actualización", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Protección", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualizar datos" })).toBeVisible();

  const details = page.locator("details").filter({ hasText: "Detalles técnicos y diagnóstico" });
  await expect(details).not.toHaveAttribute("open", "");
  await expect(page.getByText("PREVALIDACIÓN READ-ONLY", { exact: true })).toBeHidden();
  await expect(page.getByText("Revisión fuente", { exact: true })).toBeHidden();
  await expect(page.getByText("Pestañas físicas", { exact: true })).toBeHidden();

  await page.getByText("Detalles técnicos y diagnóstico", { exact: true }).click();
  await expect(details).toHaveAttribute("open", "");
  await expect(page.getByText("Revisión fuente", { exact: true })).toBeVisible();
  await expect(page.getByText("Pestañas físicas", { exact: true })).toBeVisible();
  await expect(page.getByText("rev-20261002", { exact: true })).toBeVisible();
  await expect(page.getByText("ROW-1200", { exact: true })).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(horizontalOverflow).toBe(false);
});

test("10.0.53 · Fuente mantiene el contrato de solo lectura visible en la experiencia simplificada", async ({ page }) => {
  await page.route("**/api/source/google/status", async (route) => json(route, {
    configured: true,
    authMode: "service-account",
    connection: {
      connected: true,
      accountEmail: "financial-app-reader@example.test",
      sourceFileName: "Movimientos bancarios - fuente",
      connectedAt: null,
      lastVerifiedAt: null,
      readonly: true,
      managed: true,
    },
  }));
  await page.route("**/api/health/source-runtime", async (route) => json(route, { status: "ok", compatible: true }));
  await page.route("**/api/source/google/sync", async (route) => json(route, { run: null, cursors: [] }));

  await page.goto("/configuration/source");

  await expect(page.getByText(/Google Drive y Google Sheets se usan exclusivamente en lectura/i)).toBeVisible();
  await expect(page.getByText(/La fuente bancaria original no se modifica/i)).toBeVisible();
  await expect(page.getByText(/Si falta una comprobación de seguridad, la actualización se detiene/i)).toBeVisible();
});
