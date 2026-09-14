import { expect, test } from "@playwright/test";

async function fontSize(locator: import("@playwright/test").Locator) {
  return locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

test("data trust keeps status microcopy legible and mobile-safe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/configuration/data");

  const review = page.getByLabel("Revisión del contrato de confianza");
  await expect(review).toBeVisible();
  expect(await fontSize(review)).toBeGreaterThanOrEqual(13);

  const badges = page.locator("[data-trust-state] [data-state]");
  await expect(badges).toHaveCount(7);
  for (let index = 0; index < await badges.count(); index += 1) {
    expect(await fontSize(badges.nth(index))).toBeGreaterThanOrEqual(13);
  }

  const download = page.getByRole("link", { name: "Descargar mis datos" });
  await expect(download).toBeVisible();
  const box = await download.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
