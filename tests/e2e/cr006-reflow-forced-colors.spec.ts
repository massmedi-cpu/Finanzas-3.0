import { expect, test } from "@playwright/test";

const CRITICAL_ROUTES = [
  "/login",
  "/",
  "/onboarding",
  "/review",
  "/transactions",
  "/analysis",
  "/accounts",
  "/budgets",
  "/forecast",
  "/documents",
  "/configuration",
] as const;

test("CR-006 · reflow equivalente a 400 % no introduce overflow horizontal global", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "la gate de reflow se ejecuta una vez por run");
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 320, height: 900 });

  for (const route of CRITICAL_ROUTES) {
    await test.step(route, async () => {
      const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(response, `${route} debe devolver una respuesta`).not.toBeNull();
      expect(response!.status(), `${route} no debe devolver 5xx`).toBeLessThan(500);
      await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

      const metrics = await page.evaluate(() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));

      expect(metrics.viewport).toBe(320);
      expect(
        Math.max(metrics.scrollWidth, metrics.bodyScrollWidth),
        `${route}: el contenido ordinario debe reflow sin scroll horizontal a 320 CSS px`,
      ).toBeLessThanOrEqual(metrics.viewport + 1);
    });
  }
});

test("CR-006 · forced colors mantiene operable el acceso privado", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "forced colors se ejecuta una vez por run");

  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const email = page.getByLabel("Correo electrónico");
  const password = page.getByLabel("Contraseña");
  const submit = page.getByRole("button", { name: "Entrar" });

  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  await expect(submit).toBeVisible();

  await page.keyboard.press("Tab");
  const firstFocused = await page.evaluate(() => document.activeElement?.getAttribute("name") ?? document.activeElement?.tagName.toLowerCase());
  expect(firstFocused).toBeTruthy();

  const essentialControls = await page.locator("input, button").evaluateAll((elements) =>
    elements.map((element) => {
      const node = element as HTMLElement;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        visible: style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0,
        forcedColorAdjust: style.forcedColorAdjust,
      };
    }),
  );

  expect(essentialControls.every((control) => control.visible)).toBe(true);
});
