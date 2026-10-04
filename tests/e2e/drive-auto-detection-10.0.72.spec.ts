import { expect, test, type Page } from "@playwright/test";

async function mockDocumentList(page: Page) {
  await page.route(/\/api\/documents\?(?:.*)$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: 1,
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
        principles: {
          bankSource: "read_only",
          ocrEnabled: true,
          getHasSideEffects: false,
          suggestionsPersisted: false,
          associationsRequireConfirmation: true,
        },
      }),
    });
  });
}

test.describe("Financial App 10.0.72 · Axioma §51 Drive automático", () => {
  test("comprueba Drive automáticamente sin bloquear Documentos y evita repetir en la misma sesión", async ({ page }) => {
    let syncCalls = 0;
    await mockDocumentList(page);
    await page.route("**/api/documents/drive-sync", async (route) => {
      syncCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 1,
          source: "google_drive",
          mode: "automatic_incremental_read_only",
          scanned: 4,
          detectedChanges: 0,
          imported: 0,
          unchanged: 4,
          failed: 0,
          pending: 0,
          skippedUnsupported: 0,
          skippedInvalid: 0,
          truncated: false,
          completedAt: "2026-10-04T08:00:00.000Z",
        }),
      });
    });

    await page.goto("/documents");
    await expect(page.getByTestId("drive-auto-sync")).toContainText("Drive al día");
    await expect(page.getByRole("button", { name: "Comprobar ahora" })).toBeEnabled();
    await expect.poll(() => syncCalls).toBe(1);

    await page.reload();
    await expect(page.getByTestId("drive-auto-sync")).toContainText("Drive al día");
    await expect.poll(() => syncCalls).toBe(1);

    await page.getByRole("button", { name: "Comprobar ahora" }).click();
    await expect.poll(() => syncCalls).toBe(2);
  });

  test("si Drive falla el módulo continúa disponible sin reintentos automáticos en bucle", async ({ page }) => {
    let syncCalls = 0;
    await mockDocumentList(page);
    await page.route("**/api/documents/drive-sync", async (route) => {
      syncCalls += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "drive_auto_detection_unavailable" }),
      });
    });

    await page.goto("/documents");
    await expect(page.getByTestId("drive-auto-sync")).toContainText("Documentos sigue funcionando con normalidad");
    await expect(page.getByRole("button", { name: "Comprobar ahora" })).toBeEnabled();
    await page.waitForTimeout(500);
    expect(syncCalls).toBe(1);

    await page.getByRole("button", { name: "Comprobar ahora" }).click();
    await expect.poll(() => syncCalls).toBe(2);
  });
});
