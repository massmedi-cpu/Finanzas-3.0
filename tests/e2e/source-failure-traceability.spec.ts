import { expect, test, type Page } from "@playwright/test";

const RUNTIME_OK = {
  status: "ok",
  compatible: true,
  capabilities: {
    contractVersion: 2,
    sourceAccountLifecycle: true,
    canonicalProductSelection: true,
  },
};

const CONNECTION = {
  configured: true,
  connection: {
    connected: true,
    accountEmail: "alberto@example.test",
    sourceFileName: "Movimientos bancarios - fuente",
    connectedAt: "2026-09-05T02:00:00.000Z",
    lastVerifiedAt: "2026-09-05T02:01:00.000Z",
    readonly: true,
  },
};

const SUCCESS_RUN = {
  id: "10000000-0000-4000-8000-000000000201",
  sourceFileId: "sheet-test",
  sourceRevision: "drive-version:success",
  status: "success",
  startedAt: "2026-09-05T02:00:00.000Z",
  finishedAt: "2026-09-05T02:01:00.000Z",
  rowsSeen: 3172,
  rowsInserted: 3172,
  rowsRevised: 0,
  rowsSkipped: 0,
  rowsFailed: 0,
  duplicatesDetected: 0,
  warningsCount: 0,
  errorCode: null,
  errorMessage: null,
};

const FAILED_RUN = {
  id: "10000000-0000-4000-8000-000000000202",
  sourceFileId: "sheet-test",
  sourceRevision: "drive-version:failed",
  status: "failed",
  startedAt: "2026-09-05T02:02:00.000Z",
  finishedAt: "2026-09-05T02:02:01.000Z",
  rowsSeen: 10,
  rowsInserted: 0,
  rowsRevised: 0,
  rowsSkipped: 0,
  rowsFailed: 10,
  duplicatesDetected: 0,
  warningsCount: 0,
  errorCode: "synthetic_mid_batch_failure",
  errorMessage: "El batch atómico se ha revertido por completo.",
};

const SUCCESS_CURSOR = {
  sourceFileId: "sheet-test",
  sourceSheetId: "725351515",
  sourceRevision: "drive-version:success",
  lastSourceRowKey: "CC-02963",
  lastSuccessfulRunId: SUCCESS_RUN.id,
  updatedAt: "2026-09-05T02:01:00.000Z",
};

function routeRuntime(page: Page) {
  return page.route("**/api/health/source-runtime", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RUNTIME_OK) }),
  );
}

function routeConnectedGoogle(page: Page) {
  return page.route("**/api/source/google/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CONNECTION) }),
  );
}

test.describe("Trazabilidad de fallos de sincronización", () => {
  test("un batch fallido refresca el último intento pero conserva el cursor del último éxito", async ({ page }) => {
    let failedAttemptPersisted = false;
    await routeRuntime(page);
    await routeConnectedGoogle(page);
    await page.route("**/api/source/google/sync", async (route) => {
      if (route.request().method() === "POST") {
        failedAttemptPersisted = true;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "google_source_sync_failed" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          run: failedAttemptPersisted ? FAILED_RUN : SUCCESS_RUN,
          cursors: [SUCCESS_CURSOR],
        }),
      });
    });

    await page.goto("/configuration/source");
    await expect(page.getByRole("heading", { name: "Última sincronización persistida" })).toBeVisible();
    await expect(page.getByText("CC-02963")).toBeVisible();

    await page.getByRole("button", { name: "Actualizar desde Google" }).click();

    await expect(page.locator(".config-message.error")).toContainText(
      "La operación no se ha completado. No se mostrará como correcta sin confirmación real.",
    );
    await expect(page.getByRole("heading", { name: "Último intento de sincronización" })).toBeVisible();
    await expect(page.getByText(/Último intento fallido: 10 filas no persistidas/)).toBeVisible();
    await expect(page.getByText(/Código: synthetic_mid_batch_failure/)).toBeVisible();
    await expect(page.getByText(/Cursores conservados desde la última sincronización válida/)).toBeVisible();
    await expect(page.getByText("CC-02963")).toBeVisible();
    await expect(page.getByText("drive-version:failed")).toBeVisible();
    await expect(page.getByText(/Último resultado confirmado en esta sesión/)).toHaveCount(0);
  });

  test("una regresión histórica explica el bloqueo y mantiene visible el último éxito", async ({ page }) => {
    await routeRuntime(page);
    await routeConnectedGoogle(page);
    await page.route("**/api/source/google/sync", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            error: "google_source_historical_regression",
            code: "historical_total_rows_regressed",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ run: SUCCESS_RUN, cursors: [SUCCESS_CURSOR] }),
      });
    });

    await page.goto("/configuration/source");
    await page.getByRole("button", { name: "Actualizar desde Google" }).click();

    await expect(page.locator(".config-message.error")).toContainText(
      "La fuente bancaria ha perdido o reclasificado parte del histórico validado",
    );
    await expect(page.getByRole("heading", { name: "Última sincronización persistida" })).toBeVisible();
    await expect(page.getByText("drive-version:success")).toBeVisible();
    await expect(page.getByText("CC-02963")).toBeVisible();
    await expect(page.getByText(/Último intento fallido/)).toHaveCount(0);
  });
});
