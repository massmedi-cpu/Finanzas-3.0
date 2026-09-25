import { expect, test } from "@playwright/test";

test("PWA expone manifiesto, service worker y una instalación guiada aunque no exista beforeinstallprompt", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("Financial App");
  expect(manifest.short_name).toBe("Financial");
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.prefer_related_applications).toBe(false);
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192" }),
    expect.objectContaining({ sizes: "512x512" }),
  ]));

  const workerResponse = await request.get("/sw.js");
  expect(workerResponse.ok()).toBe(true);
  const worker = await workerResponse.text();
  expect(worker).toContain("self.addEventListener(\"fetch\"");
  expect(worker).toContain("fetch(request)");
  expect(worker).not.toContain("caches.open");

  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "pwa_shell_isolated" }) });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();

  const more = page.getByRole("navigation", { name: "Navegación móvil" }).getByRole("button", { name: "Más", exact: true });
  if (await more.isVisible()) {
    await more.click();
  }
  const install = page.getByRole("button", { name: "Instalar Financial App en este dispositivo" });
  await expect(install).toBeVisible();
  await install.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/instalar|añadir/i);
  await expect(dialog.getByText(/pantalla de inicio|menú del navegador/i).first()).toBeVisible();
  await expect(dialog).toContainText("No es un acceso directo normal");
});
