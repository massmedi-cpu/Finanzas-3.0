import { expect, test } from "@playwright/test";

const viewports = [
  { name: "360", width: 360, height: 800 },
  { name: "430", width: 430, height: 900 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 900 },
] as const;

for (const viewport of viewports) {
  test.describe(`ART-007 · tipografía reproducible ${viewport.name}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("mantiene la pila system-ui, herencia y geometría estable", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Acceso privado" })).toBeVisible();

      const metrics = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const heading = getComputedStyle(document.querySelector("h1")!);
        const input = getComputedStyle(document.querySelector("input")!);
        const token = getComputedStyle(document.documentElement).getPropertyValue("--font-family-ui").trim();
        return {
          token,
          bodyFamily: body.fontFamily,
          headingFamily: heading.fontFamily,
          inputFamily: input.fontFamily,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });

      expect(metrics.token).toContain("system-ui");
      expect(metrics.token).not.toContain("Inter");
      expect(metrics.bodyFamily).toContain("system-ui");
      expect(metrics.bodyFamily).not.toContain("Inter");
      expect(metrics.headingFamily).toBe(metrics.bodyFamily);
      expect(metrics.inputFamily).toBe(metrics.bodyFamily);
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    });
  });
}
