import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = "financial-app:visual-preferences-v1";

async function openClean(page: Page) {
  await page.goto("/configuration/appearance");
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Apariencia y accesibilidad" })).toBeVisible();
}

async function rootToken(page: Page, name: string) {
  return page.evaluate((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name);
}

async function fontSize(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => getComputedStyle(element).fontSize);
}

async function assertNoGlobalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("PRE-037 · Compacta persiste, reduce espacio y no reduce tipografía", async ({ page }) => {
  await openClean(page);

  const comfortableSpace = await rootToken(page, "--space-4");
  const headingFont = await fontSize(page, "h1");
  const bodyFont = await fontSize(page, "body");

  await page.locator('input[name="density"][value="compact"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.getByTestId("density-current")).toHaveText("Compacta");

  const compactSpace = await rootToken(page, "--space-4");
  expect(compactSpace).not.toBe(comfortableSpace);
  expect(await fontSize(page, "h1")).toBe(headingFont);
  expect(await fontSize(page, "body")).toBe(bodyFont);

  const saved = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), STORAGE_KEY);
  expect(saved).toEqual({ density: "compact", reduceMotion: false, theme: "system" });

  const densityLabels = page.locator('label:has(input[name="density"])');
  for (let index = 0; index < await densityLabels.count(); index += 1) {
    const box = await densityLabels.nth(index).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.getByTestId("density-current")).toHaveText("Compacta");
  expect(await fontSize(page, "h1")).toBe(headingFont);
});

test("PRE-037 · Reducir movimiento funciona, persiste y conserva feedback", async ({ page }) => {
  await openClean(page);

  const toggle = page.getByTestId("reduce-motion-toggle");
  await toggle.check();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
  await expect(page.getByTestId("appearance-notice")).toContainText("Reducir movimiento activado");

  const transitionSeconds = await page.locator('label:has(input[value="comfortable"])').evaluate((element) => {
    const duration = getComputedStyle(element).transitionDuration.split(",")[0]?.trim() ?? "0s";
    return Number.parseFloat(duration);
  });
  expect(transitionSeconds).toBeLessThanOrEqual(0.01);

  await page.reload();
  await expect(page.getByTestId("reduce-motion-toggle")).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
});

test("PRE-037 · prefers-reduced-motion se respeta aunque la opción interna esté desactivada", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openClean(page);

  await expect(page.getByTestId("reduce-motion-toggle")).not.toBeChecked();
  const transitionSeconds = await page.locator('label:has(input[value="comfortable"])').evaluate((element) => {
    const duration = getComputedStyle(element).transitionDuration.split(",")[0]?.trim() ?? "0s";
    return Number.parseFloat(duration);
  });
  expect(transitionSeconds).toBeLessThanOrEqual(0.01);
});

test("PRE-037 · Apariencia supera matriz responsive y cambio de orientación", async ({ page }) => {
  const viewports = [
    { width: 320, height: 700 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1600, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/configuration/appearance");
    await expect(page.getByRole("heading", { name: "Apariencia y accesibilidad" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Apariencia" })).toBeVisible();
    await assertNoGlobalOverflow(page);
  }

  await page.locator('input[name="density"][value="compact"]').check();
  await assertNoGlobalOverflow(page);
});

test("PRE-037 · escalado de texto razonable no rompe la pantalla", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openClean(page);
  await page.evaluate(() => document.documentElement.style.fontSize = "125%");
  await expect(page.getByRole("heading", { name: "Apariencia y accesibilidad" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restablecer preferencias" })).toBeVisible();
  await assertNoGlobalOverflow(page);
});
