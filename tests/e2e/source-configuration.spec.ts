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

const CONNECTED_GOOGLE = {
  configured: true,
  authMode: "oauth",
  connection: {
    connected: true,
    accountEmail: "alberto@example.test",
    sourceFileName: "Movimientos bancarios - fuente",
    connectedAt: "2026-09-04T17:00:00.000Z",
    lastVerifiedAt: "2026-09-04T17:30:00.000Z",
    readonly: true,
  },
};

const EMPTY_SYNC = { run: null, cursors: [] };

function routeRuntime(page: Page) {
  return page.route("**/api/health/source-runtime", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RUNTIME_OK) }),
  );
}

function routeGoogleStatus(page: Page, payload: unknown) {
  return page.route("**/api/source/google/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }),
  );
}

function fulfillJson(route: import("@playwright/test").Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test.describe("Configuración · Fuente bancaria", () => {
  test("muestra protección explícita cuando faltan credenciales y sigue siendo responsive", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await routeRuntime(page);
    await routeGoogleStatus(page, { configured: false, connection: null, missing: ["clientId", "clientSecret"] });
    await page.route("**/api/source/google/sync", (route) => fulfillJson(route, EMPTY_SYNC));

    await page.goto("/configuration/source");

    await expect(page.getByRole("heading", { name: "Fuente bancaria", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Conecta tu fuente bancaria" })).toBeVisible();
    await expect(page.getByText("Solo lectura", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu archivo original permanece intacto" })).toBeVisible();
    await expect(page.getByText("Google se utiliza únicamente en modo lectura.", { exact: true })).toBeVisible();
    await expect(page.getByText("Financial App nunca modifica el archivo bancario original.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Actualizar desde Google" })).toBeDisabled();
    await expect(page.getByRole("link", { name: /Configuración/ })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });

  test("protege la primera actualización, prevalida y después sincroniza", async ({ page }) => {
    let synchronized = false;
    let preflightCalls = 0;
    let syncPosts = 0;

    await routeRuntime(page);
    await routeGoogleStatus(page, CONNECTED_GOOGLE);
    await page.route("**/api/source/google/preflight", async (route) => {
      preflightCalls += 1;
      await fulfillJson(route, {
        sourceFileId: "sheet-test",
        sourceRevision: "drive-version:99",
        schemaFingerprint: "a".repeat(64),
        totalAuthoritativeRows: 3172,
        accounts: [],
        cursors: [],
      });
    });
    await page.route("**/api/source/google/sync", async (route) => {
      if (route.request().method() === "POST") {
        syncPosts += 1;
        synchronized = true;
        await fulfillJson(route, {
          status: "success",
          rowsInserted: 2,
          rowsRevised: 1,
          rowsSkipped: 7,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
        });
        return;
      }

      await fulfillJson(
        route,
        synchronized
          ? {
              run: {
                status: "success",
                startedAt: "2026-09-04T17:29:00.000Z",
                finishedAt: "2026-09-04T17:30:00.000Z",
                rowsSeen: 10,
                rowsInserted: 2,
                rowsRevised: 1,
                rowsSkipped: 7,
                rowsFailed: 0,
                rowsMissing: 0,
                duplicatesDetected: 0,
                warningsCount: 0,
              },
              cursors: [{ sourceSheetId: "725351515" }],
            }
          : EMPTY_SYNC,
      );
    });

    await page.goto("/configuration/source");

    await expect(page.getByRole("heading", { name: "Google conectado" })).toBeVisible();
    await expect(page.getByText("alberto@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText("Primera actualización protegida", { exact: true })).toBeVisible();
    const update = page.getByRole("button", { name: "Actualizar desde Google" });
    await expect(update).toBeEnabled();
    await update.click();

    await expect.poll(() => preflightCalls).toBe(1);
    await expect.poll(() => syncPosts).toBe(1);
    await expect(page.getByRole("status")).toContainText("Actualización completada: 3 cambios incorporados.");
    await expect(page.getByText("Completado", { exact: true })).toBeVisible();
    await expect(page.getByText("3 incorporados", { exact: true })).toBeVisible();
    await expect(page.getByText("Primera actualización protegida", { exact: true })).toHaveCount(0);
  });

  test("expone una actualización fallida sin ocultar que los datos anteriores siguen disponibles", async ({ page }) => {
    await routeRuntime(page);
    await routeGoogleStatus(page, CONNECTED_GOOGLE);
    await page.route("**/api/source/google/sync", (route) =>
      fulfillJson(route, {
        run: {
          status: "failed",
          startedAt: "2026-09-04T17:29:00.000Z",
          finishedAt: "2026-09-04T17:30:00.000Z",
          rowsSeen: 10,
          rowsInserted: 0,
          rowsRevised: 0,
          rowsSkipped: 9,
          rowsFailed: 1,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
        },
        cursors: [{ sourceSheetId: "725351515" }],
      }),
    );

    await page.goto("/configuration/source");

    await expect(page.getByText("Requiere revisión", { exact: true })).toBeVisible();
    await expect(page.getByText("Hay elementos que necesitan revisión", { exact: true })).toBeVisible();
    await expect(page.getByText("La última actualización no terminó correctamente. Los datos anteriores siguen disponibles.", { exact: true })).toBeVisible();
  });

  test("un fallo de actualización no muestra falso éxito ni pierde la conexión", async ({ page }) => {
    await routeRuntime(page);
    await routeGoogleStatus(page, CONNECTED_GOOGLE);
    await page.route("**/api/source/google/sync", async (route) => {
      if (route.request().method() === "POST") {
        await fulfillJson(route, { error: "google_source_changed_during_read" }, 409);
        return;
      }
      await fulfillJson(route, {
        run: {
          status: "success",
          startedAt: "2026-09-04T17:29:00.000Z",
          finishedAt: "2026-09-04T17:30:00.000Z",
          rowsSeen: 12,
          rowsInserted: 0,
          rowsRevised: 0,
          rowsSkipped: 12,
          rowsFailed: 0,
          rowsMissing: 0,
          duplicatesDetected: 0,
          warningsCount: 0,
        },
        cursors: [{ sourceSheetId: "725351515" }],
      });
    });

    await page.goto("/configuration/source");
    await page.getByRole("button", { name: "Actualizar desde Google" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText("La fuente cambió mientras se estaba leyendo. Vuelve a intentarlo.");
    await expect(page.getByRole("heading", { name: "Google conectado" })).toBeVisible();
    await expect(page.getByText("alberto@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText(/Actualización completada:/)).toHaveCount(0);
    await expect(page.getByText("Financial App nunca modifica el archivo bancario original.", { exact: true })).toBeVisible();
  });
});