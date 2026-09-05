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

const PREVIOUS_SYNC = {
  run: {
    id: "10000000-0000-4000-8000-000000000088",
    sourceFileId: "sheet-test",
    sourceRevision: "drive-version:previous",
    status: "success",
    startedAt: "2026-09-04T18:55:00.000Z",
    finishedAt: "2026-09-04T18:56:00.000Z",
    rowsSeen: 3172,
    rowsInserted: 3172,
    rowsRevised: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    duplicatesDetected: 0,
    warningsCount: 0,
    errorCode: null,
    errorMessage: null,
  },
  cursors: [
    {
      sourceFileId: "sheet-test",
      sourceSheetId: "725351515",
      sourceRevision: "drive-version:previous",
      lastSourceRowKey: "CC-02963",
      lastSuccessfulRunId: "10000000-0000-4000-8000-000000000088",
      updatedAt: "2026-09-04T18:56:00.000Z",
    },
    {
      sourceFileId: "sheet-test",
      sourceSheetId: "2504001",
      sourceRevision: "drive-version:previous",
      lastSourceRowKey: "AH-00010",
      lastSuccessfulRunId: "10000000-0000-4000-8000-000000000088",
      updatedAt: "2026-09-04T18:56:00.000Z",
    },
  ],
};

function routeRuntime(page: Page) {
  return page.route("**/api/health/source-runtime", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RUNTIME_OK) }),
  );
}

function routeConnectedStatus(page: Page) {
  return page.route("**/api/source/google/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        connection: {
          connected: true,
          accountEmail: "alberto@example.test",
          sourceFileName: "Movimientos bancarios - fuente",
          connectedAt: "2026-09-04T19:00:00.000Z",
          lastVerifiedAt: "2026-09-04T18:56:00.000Z",
          readonly: true,
        },
      }),
    }),
  );
}

async function routeExistingSyncStatus(page: Page, postError: string, postStatus = 409) {
  await page.route("**/api/source/google/sync", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: postStatus,
        contentType: "application/json",
        body: JSON.stringify({ error: postError }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PREVIOUS_SYNC),
    });
  });
}

test("un cambio concurrente de la fuente se presenta como conflicto recuperable sin falso éxito", async ({ page }) => {
  await routeRuntime(page);
  await routeConnectedStatus(page);
  await routeExistingSyncStatus(page, "google_source_changed_during_read");

  await page.goto("/configuration/source");
  await expect(page.getByText("drive-version:previous")).toBeVisible();
  await page.getByRole("button", { name: "Actualizar desde Google" }).click();

  const alert = page.locator(".config-message.error");
  await expect(alert).toContainText("La fuente bancaria cambió mientras se estaba leyendo");
  await expect(alert).toContainText("Vuelve a intentarlo");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("drive-version:previous")).toBeVisible();
});

test("si la conexión desaparece durante la sincronización exige reconectar y no muestra éxito", async ({ page }) => {
  await routeRuntime(page);
  await routeConnectedStatus(page);
  await routeExistingSyncStatus(page, "google_oauth_not_connected");

  await page.goto("/configuration/source");
  await expect(page.getByText("alberto@example.test")).toBeVisible();
  await page.getByRole("button", { name: "Actualizar desde Google" }).click();

  await expect(page.locator(".config-message.error")).toContainText(
    "Google ya no está conectado. Vuelve a autorizar la fuente.",
  );
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("drive-version:previous")).toBeVisible();
});

test("un fallo temporal al renovar OAuth pide reintentar sin fingir desconexión ni éxito", async ({ page }) => {
  await routeRuntime(page);
  await routeConnectedStatus(page);
  await routeExistingSyncStatus(page, "google_oauth_refresh_unavailable", 503);

  await page.goto("/configuration/source");
  await expect(page.getByText("alberto@example.test")).toBeVisible();
  await page.getByRole("button", { name: "Actualizar desde Google" }).click();

  const alert = page.locator(".config-message.error");
  await expect(alert).toContainText("Google no ha podido renovar temporalmente la autorización");
  await expect(alert).toContainText("Vuelve a intentarlo");
  await expect(page.getByText("alberto@example.test")).toBeVisible();
  await expect(page.getByRole("button", { name: "Desconectar Google" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("drive-version:previous")).toBeVisible();
});
