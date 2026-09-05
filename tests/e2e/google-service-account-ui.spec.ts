import { expect, test } from "@playwright/test";

const RUNTIME_OK = {
  status: "ok",
  compatible: true,
  capabilities: {
    contractVersion: 2,
    sourceAccountLifecycle: true,
    canonicalProductSelection: true,
  },
};

test("la cuenta de servicio gestionada no ofrece conectar ni desconectar OAuth", async ({ page }) => {
  await page.route("**/api/source/google/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        authMode: "service-account",
        connection: {
          connected: true,
          accountEmail: "financial-app-reader@financial-app-507709.iam.gserviceaccount.com",
          sourceFileName: "Movimientos bancarios - fuente",
          connectedAt: null,
          lastVerifiedAt: null,
          readonly: true,
          managed: true,
        },
      }),
    }),
  );
  await page.route("**/api/health/source-runtime", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RUNTIME_OK) }),
  );
  await page.route("**/api/source/google/sync", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run: null, cursors: [] }),
    });
  });

  await page.goto("/configuration/source");

  await expect(page.getByText("Cuenta de servicio Google")).toBeVisible();
  await expect(page.getByText("financial-app-reader@financial-app-507709.iam.gserviceaccount.com")).toBeVisible();
  await expect(page.getByText("Conexión gestionada por el servidor; no requiere autorización manual periódica.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Conectar Google" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desconectar Google" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Validar fuente antes de importar" })).toBeEnabled();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(horizontalOverflow).toBe(false);
});
