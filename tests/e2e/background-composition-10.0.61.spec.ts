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
      await expect(page.locator("#main-content")).toHaveCount(1);
      await expect(page.locator("#main-content > *")).toHaveCount(1);

      const visual = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[data-app-shell="shared"]')!;
        const content = document.querySelector<HTMLElement>("#main-content")!;
        const pageRoot = document.querySelector<HTMLElement>("#main-content > *")!;
        const body = getComputedStyle(document.body);
        return {
          mobile: window.matchMedia("(max-width: 48rem)").matches,
          token: getComputedStyle(document.documentElement).getPropertyValue("--gradient-app-canvas").trim(),
          bodyImage: body.backgroundImage,
          bodyAttachment: body.backgroundAttachment,
          rootColor: getComputedStyle(root).backgroundColor,
          contentColor: getComputedStyle(content).backgroundColor,
          pageColor: getComputedStyle(pageRoot).backgroundColor,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });

      expect(visual.token).toContain("radial-gradient");
      expect(visual.bodyImage).toContain("radial-gradient");
      expect((visual.bodyImage.match(/radial-gradient/g) ?? []).length).toBe(2);
      expect((visual.bodyImage.match(/linear-gradient/g) ?? []).length).toBe(1);
      expect(visual.bodyImage).not.toContain("repeating-linear-gradient");

      const expectedAttachment = visual.mobile ? "scroll" : "fixed";
      const attachments = visual.bodyAttachment.split(",").map((value) => value.trim());
      expect(attachments).toHaveLength(3);
      expect(attachments.every((value) => value === expectedAttachment)).toBe(true);

      expect(visual.rootColor).toBe("rgba(0, 0, 0, 0)");
      expect(visual.contentColor).toBe("rgba(0, 0, 0, 0)");
      expect(visual.pageColor).toBe("rgba(0, 0, 0, 0)");
      expect(visual.documentWidth).toBeLessThanOrEqual(visual.viewportWidth + 1);
    });
  });
}
