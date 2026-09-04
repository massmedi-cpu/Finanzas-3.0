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

function routeRuntime(page: Page) {
  return page.route("**/api/health/source-runtime", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RUNTIME_OK) }),
  );
}

test.describe("Configuración · Fuente bancaria", () => {
  test("muestra un bloqueo explícito cuando faltan credenciales y sigue siendo responsive", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await routeRuntime(page);
    await page.route("**/api/source/google/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: false,
          connection: null,
          missing: ["clientId", "clientSecret", "redirectUri", "spreadsheetId", "allowedEmail"],
        }),
      }),
    );

    await page.goto("/configuration/source");

    await expect(page.getByRole("heading", { name: "Fuente bancaria" })).toBeVisible();
    await expect(page.getByText("Google · solo lectura")).toBeVisible();
    await expect(page.getByText("Compatible · contrato v2")).toBeVisible();
    await expect(page.getByText("Cliente OAuth de Google")).toBeVisible();
    await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Fuente bancaria" })).toHaveAttribute("aria-current", "page");

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });

  test("solo confirma una actualización después de un POST real y relee el estado persistido", async ({ page }) => {
    let synchronized = false;
    await routeRuntime(page);
    await page.route("**/api/source/google/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          connection: {
            connected: true,
            accountEmail: "alberto@example.test",
            sourceFileName: "Movimientos bancarios - fuente",
            connectedAt: "2026-09-04T17:00:00.000Z",
            lastVerifiedAt: synchronized ? "2026-09-04T17:30:00.000Z" : null,
            readonly: true,
          },
        }),
      }),
    );
    await page.route("**/api/source/google/sync", async (route) => {
      if (route.request().method() === "POST") {
        synchronized = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            syncRunId: "10000000-0000-4000-8000-000000000099",
            status: "success",
            rowsSeen: 10,
            rowsInserted: 2,
            rowsRevised: 1,
            rowsSkipped: 7,
            rowsMissing: 0,
            duplicatesDetected: 0,
            warningsCount: 0,
            cursorsAdvanced: 2,
            sourceRevision: "drive-version:99",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          synchronized
            ? {
                run: {
                  id: "10000000-0000-4000-8000-000000000099",
                  sourceFileId: "sheet-test",
                  sourceRevision: "drive-version:99",
                  status: "success",
                  startedAt: "2026-09-04T17:29:00.000Z",
                  finishedAt: "2026-09-04T17:30:00.000Z",
                  rowsSeen: 10,
                  rowsInserted: 2,
                  rowsRevised: 1,
                  rowsSkipped: 7,
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
                    sourceRevision: "drive-version:99",
                    lastSourceRowKey: "CC-00001",
                    lastSuccessfulRunId: "10000000-0000-4000-8000-000000000099",
                    updatedAt: "2026-09-04T17:30:00.000Z",
                  },
                  {
                    sourceFileId: "sheet-test",
                    sourceSheetId: "2504001",
                    sourceRevision: "drive-version:99",
                    lastSourceRowKey: "AH-00001",
                    lastSuccessfulRunId: "10000000-0000-4000-8000-000000000099",
                    updatedAt: "2026-09-04T17:30:00.000Z",
                  },
                ],
              }
            : { run: null, cursors: [] },
        ),
      });
    });

    await page.goto("/configuration/source");
    await expect(page.getByText("alberto@example.test")).toBeVisible();
    await expect(page.getByText("Todavía no existe una sincronización real persistida para esta fuente.")).toBeVisible();

    await page.getByRole("button", { name: "Actualizar desde Google" }).click();

    await expect(page.getByRole("status")).toContainText("2 nuevos, 1 revisados y 7 sin cambios");
    await expect(page.getByRole("heading", { name: "Última sincronización persistida" })).toBeVisible();
    await expect(page.getByText("drive-version:99")).toBeVisible();
    await expect(page.getByText("CC-00001")).toBeVisible();
    await expect(page.getByText("AH-00001")).toBeVisible();
  });

  test("convierte un error de retorno OAuth en un mensaje comprensible y limpia la URL", async ({ page }) => {
    await routeRuntime(page);
    await page.route("**/api/source/google/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ configured: false, connection: null, missing: ["clientId"] }),
      }),
    );

    await page.goto("/configuration/source?google=error&code=google_account_not_allowed");

    await expect(page.locator(".config-message.error")).toContainText("La cuenta Google utilizada no es la autorizada");
    await expect.poll(() => new URL(page.url()).search).toBe("");
  });
});
