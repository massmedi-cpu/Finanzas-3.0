import { expect, test } from "@playwright/test";

const PREFERENCES_KEY = "financial-app:product-preferences-v1";
const SESSION_SYNC_KEY = "financial-app:auto-sync-attempted-v1";

test("FA-STORE-001 · blocked localStorage is disclosed, never described as saved", async ({ page }) => {
  await page.addInitScript((storageKey) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && key === storageKey) {
        throw new DOMException("Storage disabled", "SecurityError");
      }
      return originalSetItem.call(this, key, value);
    };
  }, PREFERENCES_KEY);

  await page.goto("/configuration/preferences");
  await expect(page.getByRole("alert").filter({ hasText: "no permite guardar las preferencias" })).toBeVisible();

  const attention = page.getByRole("radio", { name: /Solo categorías con exceso/i });
  await attention.check();
  await expect(attention).toBeChecked();

  // React state works in this tab, but a reload must not pretend it persisted.
  await page.reload();
  await expect(page.getByRole("radio", { name: "Todas las categorías" })).toBeChecked();
  await expect(page.getByRole("alert").filter({ hasText: "se perderán al recargar" })).toBeVisible();
});

test("FA-STORE-002 · blocked sessionStorage cannot trigger automatic financial import", async ({ page }) => {
  await page.addInitScript(({ preferencesKey, syncKey }) => {
    window.localStorage.setItem(preferencesKey, JSON.stringify({
      budgetFocus: "all", syncOnOpen: true, privacyOnBlur: false, homeDestination: "/",
    }));
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (this === window.sessionStorage && key === syncKey) {
        throw new DOMException("Storage disabled", "SecurityError");
      }
      return originalGetItem.call(this, key);
    };
  }, { preferencesKey: PREFERENCES_KEY, syncKey: SESSION_SYNC_KEY });

  let sourceRequests = 0;
  await page.route("**/api/source/google/**", async (route) => {
    sourceRequests += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"isolated_test"}' });
  });

  await page.goto("/configuration/preferences");
  await expect(page.getByRole("alert").filter({ hasText: "No se ha iniciado ninguna sincronización automática" })).toBeVisible();
  expect(sourceRequests, "No automatic preflight or database mutation must be requested").toBe(0);

  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "No se ha iniciado ninguna sincronización automática" })).toBeVisible();
  expect(sourceRequests, "Reload must remain fail-closed").toBe(0);
});

test("FA-STORE-003 · failed automatic preflight does not claim a confirmed sync", async ({ page }) => {
  await page.addInitScript((preferencesKey) => {
    window.localStorage.setItem(preferencesKey, JSON.stringify({
      budgetFocus: "all", syncOnOpen: true, privacyOnBlur: false, homeDestination: "/",
    }));
  }, PREFERENCES_KEY);

  let preflights = 0;
  let imports = 0;
  await page.route("**/api/source/google/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/preflight")) preflights += 1;
    if (pathname.endsWith("/sync")) imports += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"isolated_test"}' });
  });

  await page.goto("/configuration/preferences");
  await expect(page.getByRole("alert").filter({ hasText: "No se ha podido confirmar la actualización automática" })).toBeVisible();
  expect(preflights).toBe(1);
  expect(imports).toBe(0);
  await expect(page.getByText("Última sincronización automática de esta sesión:", { exact: false })).toHaveCount(0);
});

test("FA-STORE-004 · enabling future automatic sync never imports immediately", async ({ page }) => {
  let preflights = 0;
  let imports = 0;
  await page.route("**/api/source/google/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && pathname.endsWith("/preflight")) preflights += 1;
    if (route.request().method() === "POST" && pathname.endsWith("/sync")) imports += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"isolated_test"}' });
  });

  await page.goto("/configuration/preferences");
  const toggle = page.getByRole("checkbox", { name: "Intentar sincronizar una vez por sesión" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole("status")).toContainText("próximas aperturas");

  // Allow effects and potential network requests time to run before declaring zero writes.
  await page.waitForTimeout(350);
  expect(preflights, "Enabling a next-open preference must not start a source preflight now").toBe(0);
  expect(imports, "Enabling a next-open preference must never start a bank import now").toBe(0);

  await expect.poll(async () => page.evaluate((key) => {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value).syncOnOpen : null;
  }, PREFERENCES_KEY)).toBe(true);

  // Reopening with an already-enabled preference may preflight once, but a
  // failed preflight must never issue POST /sync or claim a confirmed import.
  await page.reload();
  await expect(page.getByRole("alert").filter({
    hasText: "No se ha podido confirmar la actualización automática",
  })).toBeVisible();
  expect(preflights).toBe(1);
  expect(imports).toBe(0);
});
