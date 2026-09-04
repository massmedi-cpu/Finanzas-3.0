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
          missing: ["clientId", "clientSecret", "allowedEmail"],
        }),
      }),
    );

    await page.goto("/configuration/source");

    await expect(page.getByRole("heading", { name: "Fuente bancaria" })).toBeVisible();
    await expect(page.getByText("Google · solo lectura")).toBeVisible();
    await expect(page.getByText("Compatible · contrato v2")).toBeVisible();
    await expect(page.getByText("Cliente OAuth de Google")).toBeVisible();
    await expect(page.getByText("Secreto OAuth de Google")).toBeVisible();
    await expect(page.getByText("Cuenta Google autorizada")).toBeVisible();
    await expect(page.getByText("URL de retorno OAuth")).toHaveCount(0);
    await expect(page.getByText("ID del Google Sheet oficial")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Fuente bancaria" })).toHaveAttribute("aria-current", "page");

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });

  test("prevalida la primera importación sin persistir y solo después permite sincronizar", async ({ page }) => {
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
    await page.route("**/api/source/google/preflight", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sourceFileId: "sheet-test",
          sourceRevision: "drive-version:99",
          schemaFingerprint: "a".repeat(64),
          totalAuthoritativeRows: 3172,
          accounts: [
            {
              accountExternalKey: "Cuenta corriente Openbank · 3967",
              accountName: "Cuenta corriente Openbank · 3967",
              accountType: "checking",
              lifecycle: "active",
              authoritativeRows: 3024,
              openingBalanceCents: 0,
              newestBankDate: "2026-09-04",
              oldestBankDate: "2024-01-01",
              latestBalanceAfterCents: 188827,
            },
            {
              accountExternalKey: "Cuenta ahorro Openbank · 2504",
              accountName: "Cuenta ahorro Openbank · 2504",
              accountType: "savings",
              lifecycle: "active",
              authoritativeRows: 15,
              openingBalanceCents: 0,
              newestBankDate: "2026-09-04",
              oldestBankDate: "2026-01-01",
              latestBalanceAfterCents: 18695772,
            },
            {
              accountExternalKey: "Tarjeta prepago Openbank · 8403",
              accountName: "Tarjeta prepago Openbank · 8403",
              accountType: "other",
              lifecycle: "archived",
              authoritativeRows: 133,
              openingBalanceCents: 0,
              newestBankDate: "2026-08-21",
              oldestBankDate: "2024-01-01",
              latestBalanceAfterCents: null,
            },
          ],
          cursors: [
            {
              sourceSheetId: "725351515",
              sheetTitle: "Cuenta corriente · 3967",
              authoritativeRows: 3157,
              lastSourceRowKey: "CC-02963",
            },
            {
              sourceSheetId: "2504001",
              sheetTitle: "Cuenta ahorro · 2504",
              authoritativeRows: 15,
              lastSourceRowKey: "AH-00010",
            },
          ],
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
    await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toHaveCount(0);
    await expect(page.getByText("Primera importación protegida")).toBeVisible();

    await page.getByRole("button", { name: "Validar fuente antes de importar" }).click();

    await expect(page.getByRole("status")).toContainText("3172 movimientos autoritativos y 3 productos");
    await expect(page.getByRole("heading", { name: "Fotografía autoritativa antes de importar" })).toBeVisible();
    await expect(page.getByText("Cuenta corriente Openbank · 3967")).toBeVisible();
    await expect(page.getByText("1888,27 €")).toBeVisible();
    await expect(page.getByText("Cursor previsto: CC-02963")).toBeVisible();
    await expect(page.getByText("Cursor previsto: AH-00010")).toBeVisible();
    await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeEnabled();

    await page.getByRole("button", { name: "Actualizar desde Google" }).click();

    await expect(page.getByRole("status")).toContainText("2 nuevos, 1 revisados y 7 sin cambios");
    const persistedSync = page.getByLabel("Última sincronización");
    await expect(page.getByRole("heading", { name: "Última sincronización persistida" })).toBeVisible();
    await expect(persistedSync.getByText("drive-version:99")).toBeVisible();
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

  test("desconectar Google elimina la autorización pero conserva la sincronización persistida", async ({ page }) => {
    let connected = true;
    await routeRuntime(page);
    await page.route("**/api/source/google/status", async (route) => {
      if (route.request().method() === "DELETE") {
        connected = false;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ disconnected: true }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          connection: connected
            ? {
                connected: true,
                accountEmail: "alberto@example.test",
                sourceFileName: "Movimientos bancarios - fuente",
                connectedAt: "2026-09-04T17:00:00.000Z",
                lastVerifiedAt: "2026-09-04T17:30:00.000Z",
                readonly: true,
              }
            : null,
        }),
      });
    });
    await page.route("**/api/source/google/sync", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          run: {
            id: "10000000-0000-4000-8000-000000000077",
            sourceFileId: "sheet-test",
            sourceRevision: "drive-version:disconnect",
            status: "success",
            startedAt: "2026-09-04T17:29:00.000Z",
            finishedAt: "2026-09-04T17:30:00.000Z",
            rowsSeen: 12,
            rowsInserted: 12,
            rowsRevised: 0,
            rowsSkipped: 0,
            rowsFailed: 0,
            duplicatesDetected: 0,
            warningsCount: 0,
            errorCode: null,
            errorMessage: null,
          },
          cursors: [],
        }),
      }),
    );

    await page.goto("/configuration/source");
    await expect(page.getByRole("button", { name: "Desconectar Google" })).toBeVisible();
    await expect(page.getByText("drive-version:disconnect")).toBeVisible();

    await page.getByRole("button", { name: "Desconectar Google" }).click();

    await expect(page.getByRole("status")).toContainText(
      "Conexión Google eliminada. Los movimientos ya importados permanecen intactos.",
    );
    await expect(page.getByRole("link", { name: "Conectar Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Desconectar Google" })).toHaveCount(0);
    await expect(page.getByText("drive-version:disconnect")).toBeVisible();
  });

  test("un fallo al desconectar Google no muestra falso éxito ni oculta la conexión", async ({ page }) => {
    await routeRuntime(page);
    await page.route("**/api/source/google/status", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "google_disconnect_failed" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          connection: {
            connected: true,
            accountEmail: "alberto@example.test",
            sourceFileName: "Movimientos bancarios - fuente",
            connectedAt: "2026-09-04T17:00:00.000Z",
            lastVerifiedAt: null,
            readonly: true,
          },
        }),
      });
    });
    await page.route("**/api/source/google/sync", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ run: null, cursors: [] }),
      }),
    );

    await page.goto("/configuration/source");
    await page.getByRole("button", { name: "Desconectar Google" }).click();

    await expect(page.locator(".config-message.error")).toContainText("No se ha podido desconectar Google.");
    await expect(page.getByRole("button", { name: "Desconectar Google" })).toBeVisible();
    await expect(page.getByText("alberto@example.test")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });
});
