import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST as logout } from "../../app/api/auth/logout/route";
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE } from "../../src/infrastructure/auth/access-control";

test("REC-AUTH-LOGOUT · escritorio ofrece salida y vuelve al acceso privado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  let requests = 0;
  await page.route("**/api/auth/logout", async (route) => {
    expect(route.request().method()).toBe("POST");
    requests++;
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.goto("/onboarding");
  await page.getByRole("link", { name: "Cerrar sesión de Financial App" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(requests).toBe(1);
});

test("REC-AUTH-LOGOUT · móvil presenta cierre accesible desde Más", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  let requests = 0;
  await page.route("**/api/auth/logout", async (route) => {
    requests++;
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.goto("/onboarding");
  await page.getByRole("navigation", { name: "Navegación móvil" }).getByRole("button", { name: "Más" }).click();
  const exit = page.getByRole("navigation", { name: "Más secciones" })
    .getByRole("link", { name: "Cerrar sesión de Financial App" });
  await expect(exit).toBeVisible();
  await exit.click();
  await expect(page).toHaveURL(/\/login$/);
  expect(requests).toBe(1);
});

test("REC-AUTH-LOGOUT · sin confirmación del servidor permite reintento, sin falsa salida", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/auth/logout", async (route) => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' });
    else await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.goto("/logout");
  // Next.js owns a separate, empty route-announcer with role="alert".
  // Assert the message in this screen, not an unrelated framework live region.
  await expect(page.locator("main#main-content [role=\"alert\"]")).toContainText("No se ha podido confirmar");
  await expect(page).toHaveURL(/\/logout$/);
  await page.getByRole("button", { name: "Reintentar cierre de sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(attempts).toBe(2);
});

test("REC-AUTH-LOGOUT · POST borra ambas cookies ante revocación remota fallida", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new Error("synthetic_offline"); };
    const response = await logout(new NextRequest("https://financialapp.test/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${AUTH_ACCESS_COOKIE}=synthetic-access; ${AUTH_REFRESH_COOKIE}=synthetic-refresh` },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    const cookies = response.headers.getSetCookie().join(";");
    for (const name of [AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE]) expect(cookies).toContain(`${name}=`);
    expect(cookies).toContain("Max-Age=0");
  } finally {
    global.fetch = originalFetch;
  }
});
