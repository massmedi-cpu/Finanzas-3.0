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

test("un cambio concurrente de la fuente se presenta como conflicto recuperable sin falso éxito", async ({ page }) => {
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
          connectedAt: "2026-09-04T19:00:00.000Z",
          lastVerifiedAt: null,
          readonly: true,
        },
      }),
    }),
  );
  await page.route("**/api/source/google/sync", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "google_source_changed_during_read" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run: null, cursors: [] }),
    });
  });

  await page.goto("/configuration/source");
  await page.getByRole("button", { name: "Actualizar desde Google" }).click();

  const appError = page.locator(".config-message.error");
  await expect(appError).toContainText("La fuente bancaria cambió mientras se estaba leyendo");
  await expect(appError).toContainText("Vuelve a intentarlo");
  await expect(page.locator(".config-message.success")).toHaveCount(0);
  await expect(page.getByText("Todavía no existe una sincronización real persistida para esta fuente.")).toBeVisible();
});
