import { expect, test } from "@playwright/test";

// Synthetic UI-only contrast regression. These are real browser-computed styles,
// not measurements of a protected user's banking account.
for (const theme of ["light", "dark"] as const) {
  test(`REC-VIS-005 · Cash Flow information and configuration warnings use readable ${theme} tokens`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/cash-flow?month=invalid");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    // An invalid calendar month always presents a deterministic status notice,
    // even with no gateway identity or bank data in this test process.
    const notice = page.getByText("El mes solicitado no era válido; se muestra el mes actual.", { exact: true });
    await expect(notice).toBeVisible();

    const colors = await page.evaluate((selector) => {
      const status = document.querySelector(selector);
      if (!status) throw new Error("Missing invalid-month status notice");
      const root = getComputedStyle(document.documentElement);
      const documentColor = (node: Element) => getComputedStyle(node).color;
      const extra = document.createElement("p");
      extra.className = "config-message warning";
      extra.textContent = "Synthetic warning contrast fixture";
      document.body.appendChild(extra);
      const result = {
        noticeColor: documentColor(status),
        warningColor: documentColor(extra),
        primary: root.getPropertyValue("--color-primary-bright").trim(),
        warning: root.getPropertyValue("--text-warning-soft").trim(),
        canvas: root.getPropertyValue("--color-bg").trim(),
      };
      extra.remove();
      return result;
    }, '[role="status"]');

    const hexToRgb = (hex: string) => {
      const match = /^#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex);
      if (!match) throw new Error(`Unexpected color token: ${hex}`);
      return match.slice(1).map((part) => parseInt(part, 16));
    };
    const rgb = (color: string) => {
      const match = /^rgb\\((\\d+), (\\d+), (\\d+)\\)$/.exec(color);
      if (!match) throw new Error(`Unexpected CSS color: ${color}`);
      return match.slice(1).map(Number);
    };
    const luminance = (values: number[]) => {
      const linear = values.map((v) => {
        const channel = v / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const ratio = (foreground: number[], background: number[]) => {
      const l1 = luminance(foreground), l2 = luminance(background);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    expect(rgb(colors.noticeColor)).toEqual(hexToRgb(colors.primary));
    expect(rgb(colors.warningColor)).toEqual(hexToRgb(colors.warning));
    expect(ratio(rgb(colors.noticeColor), hexToRgb(colors.canvas))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(colors.warningColor), hexToRgb(colors.canvas))).toBeGreaterThanOrEqual(4.5);
  });
}
