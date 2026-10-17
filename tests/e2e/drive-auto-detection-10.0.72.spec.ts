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
          principles: {
            bankSource: "read_only", driveSource: "read_only",
            duplicateSafe: true, nonBlocking: true,
          },
        }),
      });
    });

    await page.goto("/documents");
    await expect(page.getByTestId("drive-auto-sync")).toContainText("Carpeta comprobada. No hay documentos nuevos");
    await expect(page.getByRole("button", { name: "Comprobar ahora" })).toBeEnabled();
    await expect.poll(() => syncCalls).toBe(1);

    await page.reload();
    await expect(page.getByTestId("drive-auto-sync")).toContainText("Carpeta comprobada. No hay documentos nuevos");
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
    await expect(page.getByTestId("drive-auto-sync")).toContainText("No se ha podido verificar Drive");
    await expect(page.getByTestId("documents-filtered-empty")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Comprobar ahora" })).toBeEnabled();
    await page.waitForTimeout(500);
    expect(syncCalls).toBe(1);

    await page.getByRole("button", { name: "Comprobar ahora" }).click();
    await expect.poll(() => syncCalls).toBe(2);
  });
});

test("REC-DRIVE-137 · importación automática refresca lista sin perder filtros ni recargar", async ({ page }) => {
  let documentReads = 0;
  let navigations = 0;
  page.on("request", request => {
    if (request.isNavigationRequest() && new URL(request.url()).pathname === "/documents") {
      navigations += 1;
    }
  });
  await page.route(/\/api\/documents\?(?:.*)$/, route => {
    documentReads += 1;
    const url = new URL(route.request().url());
    return route.fulfill({ json: {
      contractVersion: 3, items: [], total: 0, limit: 50,
      offset: Number(url.searchParams.get("offset") ?? 0), testCount: 0,
      principles: { bankSource: "read_only", ocrEnabled: true,
        getHasSideEffects: false, suggestionsPersisted: false,
        associationsRequireConfirmation: true },
    } });
  });
  let syncCalls = 0;
  await page.route("**/api/documents/drive-sync", async route => {
    syncCalls += 1;
    // Give the user time to start editing while the automatic import is running.
    await new Promise(resolve => setTimeout(resolve, 850));
    return route.fulfill({ json: {
      contractVersion: 1, source: "google_drive",
      mode: "automatic_incremental_read_only", scanned: 1,
      detectedChanges: 1, imported: 1, unchanged: 0,
      failed: 0, pending: 0, skippedUnsupported: 0,
      skippedInvalid: 0, truncated: false,
      completedAt: "2026-10-12T10:00:00.000Z",
      principles: { bankSource: "read_only", driveSource: "read_only",
        duplicateSafe: true, nonBlocking: true },
    } });
  });
  await page.goto("/documents");
  const filter = page.getByPlaceholder("Nombre, emisor o notas");
  await filter.fill("borrador sin guardar");
  await expect(page.getByTestId("drive-auto-sync")).toContainText("documento incorporado o actualizado");
  await expect(filter).toHaveValue("borrador sin guardar");
  await expect.poll(() => documentReads).toBeGreaterThanOrEqual(2);
  expect(syncCalls).toBe(1);
  expect(navigations).toBe(1);
});

test("REC-DRIVE-138 · incoherent imported count is never shown as completed", async ({ page }) => {
  await mockDocumentList(page);
  await page.route("**/api/documents/drive-sync", route => route.fulfill({ json: {
    contractVersion: 1, source: "google_drive", mode: "automatic_incremental_read_only",
    scanned: 1, detectedChanges: 1, imported: 0, failed: 0, pending: 0,
    unchanged: 0, skippedUnsupported: 0, skippedInvalid: 0, truncated: false,
    completedAt: "2026-10-12T10:00:00.000Z",
    principles: { bankSource: "read_only", driveSource: "read_only",
      duplicateSafe: true, nonBlocking: true },
  } }));
  await page.goto("/documents");
  const sync = page.getByTestId("drive-auto-sync");
  await expect(sync).toContainText("No se ha podido verificar Drive");
  await expect(sync).not.toContainText("Carpeta comprobada.");
});
