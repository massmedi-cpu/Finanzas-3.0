import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1366, height: 900 },
] as const;

for (const viewport of viewports) {
  test.describe(`ART-008 · fondo canónico ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("el lienzo global domina y las páginas no compiten", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('[data-app-shell="shared"]')).toHaveCount(1);
      await expect(page.locator("#main-content > main")).toHaveCount(1);

      const visual = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[data-app-shell="shared"]')!;
        const content = document.querySelector<HTMLElement>("#main-content")!;
        const main = document.querySelector<HTMLElement>("#main-content > main")!;
        const body = getComputedStyle(document.body);
        return {
          token: getComputedStyle(document.documentElement).getPropertyValue("--gradient-app-canvas").trim(),
          bodyImage: body.backgroundImage,
          bodyAttachment: body.backgroundAttachment,
          rootColor: getComputedStyle(root).backgroundColor,
          contentColor: getComputedStyle(content).backgroundColor,
          mainColor: getComputedStyle(main).backgroundColor,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });

      expect(visual.token).toContain("radial-gradient");
      expect(visual.bodyImage).toContain("radial-gradient");
      expect((visual.bodyImage.match(/radial-gradient/g) ?? []).length).toBe(2);
      expect((visual.bodyImage.match(/linear-gradient/g) ?? []).length).toBe(1);
      expect(visual.bodyImage).not.toContain("repeating-linear-gradient");
      expect(visual.bodyAttachment).toBe("fixed");
      expect(visual.rootColor).toBe("rgba(0, 0, 0, 0)");
      expect(visual.contentColor).toBe("rgba(0, 0, 0, 0)");
      expect(visual.mainColor).toBe("rgba(0, 0, 0, 0)");
      expect(visual.documentWidth).toBeLessThanOrEqual(visual.viewportWidth + 1);
    });
  });
}
