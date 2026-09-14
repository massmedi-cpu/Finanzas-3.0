import { expect, test } from "@playwright/test";

test("D-01 · Inter está realmente cargada y no introduce overflow global", async ({ page }) => {
  await page.goto("/__cr006_typography_probe__");
  await page.waitForLoadState("domcontentloaded");

  const typography = await page.evaluate(async () => {
    await document.fonts.ready;
    const body = window.getComputedStyle(document.body);
    const loadedFamilies = Array.from(document.fonts)
      .filter((face) => face.status === "loaded")
      .map((face) => face.family.replace(/["']/g, ""));

    return {
      bodyFamily: body.fontFamily.replace(/["']/g, ""),
      loadedFamilies,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  expect(typography.bodyFamily.toLowerCase()).toContain("inter");
  expect(typography.loadedFamilies.some((family) => family.toLowerCase().includes("inter"))).toBe(true);
  expect(typography.hasHorizontalOverflow).toBe(false);
});
