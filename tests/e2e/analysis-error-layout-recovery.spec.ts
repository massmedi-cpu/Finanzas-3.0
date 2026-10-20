import { expect, test } from "@playwright/test";

// Real browser layout, isolated HTTP errors. No banking documents, user identity,
// remote persistence or OCR originals are read by this regression.
for (const theme of ["light", "dark"] as const) {
  for (const width of [1366, 1440]) {
    test(`REC-UI-ANA-016 · análisis sin datos no solapa filtros ni deja un vacío a ${width}px / ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 920 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.route("**/api/analysis?*", (route) =>
        route.fulfill({ status: 503, json: { error: "isolated_analysis_unavailable" } }));
      await page.route("**/api/analysis/source-freshness*", (route) =>
        route.fulfill({ status: 503, json: { error: "isolated_source_unavailable" } }));
      await page.goto("/analysis");
      await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const error = page.getByRole("alert")
        .filter({ hasText: "No se pudo preparar el análisis inicial" });
      await expect(error).toBeVisible();
      const selector = page.getByRole("form", { name: "Filtros del análisis" })
        .getByRole("group", { name: "Rango temporal" });
      await expect(selector).toBeVisible();
      const buttons = selector.getByRole("button");
      await expect(buttons).toHaveCount(5);
      const outer = await selector.boundingBox();
      expect(outer).not.toBeNull();

      const boxes = [];
      for (let index = 0; index < 5; index += 1) {
        const box = await buttons.nth(index).boundingBox();
        expect(box, `Range selector button ${index} must be visible`).not.toBeNull();
        boxes.push(box!);
        expect(box!.width).toBeGreaterThan(45);
        expect(box!.x).toBeGreaterThanOrEqual(outer!.x - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(outer!.x + outer!.width + 1);
      }
      // This detects overlapping flex children even when the document itself
      // does not overflow horizontally and axe reports no violations.
      for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
        const horizontal = Math.min(boxes[i].x + boxes[i].width, boxes[j].x + boxes[j].width)
          - Math.max(boxes[i].x, boxes[j].x);
        const vertical = Math.min(boxes[i].y + boxes[i].height, boxes[j].y + boxes[j].height)
          - Math.max(boxes[i].y, boxes[j].y);
        expect(horizontal <= 1 || vertical <= 1, `Range buttons ${i} and ${j} overlap`).toBe(true);
      }

      // REC-VIS-243: in the original 1366px screenshot, the Spanish month
      // label physically painted over the adjacent calendar icon. A no-overflow
      // document check cannot catch that intra-control collision.
      const monthInput = page.getByRole("form", { name: "Filtros del análisis" })
        .locator('input[type="month"]');
      await expect(monthInput).toHaveCount(1);
      const monthControl = monthInput.locator("..");
      const monthText = monthControl.locator("span").first();
      const calendarIcon = monthControl.locator('svg[data-product-icon="calendar"]');
      const textBox = await monthText.boundingBox();
      const iconBox = await calendarIcon.boundingBox();
      const controlBox = await monthControl.boundingBox();
      expect(textBox && iconBox && controlBox, "month text, icon and control must render").toBeTruthy();
      expect(textBox!.x + textBox!.width,
        `Spanish month must not cover the calendar at ${width}px / ${theme}`)
        .toBeLessThanOrEqual(iconBox!.x - 4);
      expect(iconBox!.x + iconBox!.width,
        `calendar must fit the month control at ${width}px / ${theme}`)
        .toBeLessThanOrEqual(controlBox!.x + controlBox!.width - 4);

      const errorBounds = await error.boundingBox();
      const advanced = page.getByRole("heading", { name: "Elige qué quieres analizar" });
      const advancedBounds = await advanced.boundingBox();
      expect(errorBounds && advancedBounds).toBeTruthy();
      // The old analysis shell reserved a full 100vh even when it displayed
      // only one error line. That pushed usable controls below the fold.
      const gap = advancedBounds!.y - (errorBounds!.y + errorBounds!.height);
      expect(gap, "Advanced filters must follow the error without a viewport-sized blank").toBeLessThan(320);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth
        <= document.documentElement.clientWidth + 1)).toBe(true);
    });
  }
}
