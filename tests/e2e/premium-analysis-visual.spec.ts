import { expect, test } from "@playwright/test";

const WIDTHS = [360, 430, 768, 1024, 1280, 1440] as const;

for (const width of WIDTHS) {
  test(`Premium Análisis · ${width}px sin overflow y con jerarquía financiera completa`, async ({ page }) => {
    test.skip(!process.env.VERCEL_PREVIEW_URL, "gate visual reservado al Preview real");

    await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
    await page.goto("/analysis", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Análisis", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Indicadores principales del periodo")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cómo está cambiando tu dinero" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tu gasto (ha aumentado|ha disminuido|se mantiene)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dónde se concentra el gasto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gasto fijo y variable" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Movimientos que merece la pena revisar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Presupuesto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Previsión" })).toBeVisible();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    ).toBe(true);

    const apply = page.getByRole("button", { name: "Aplicar" });
    const applyBox = await apply.boundingBox();
    expect(applyBox).not.toBeNull();
    expect(applyBox!.height).toBeGreaterThanOrEqual(44);

    const range = page.getByRole("button", { name: "1 mes" });
    const rangeBox = await range.boundingBox();
    expect(rangeBox).not.toBeNull();
    expect(rangeBox!.height).toBeGreaterThanOrEqual(44);

    const chartMonth = page.locator('button[aria-label*="ingresos"][aria-label*="gastos"]').last();
    await expect(chartMonth).toBeVisible();
    const chartMonthBox = await chartMonth.boundingBox();
    expect(chartMonthBox).not.toBeNull();
    expect(chartMonthBox!.height).toBeGreaterThanOrEqual(44);

    await chartMonth.focus();
    await expect(chartMonth).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").filter({ hasText: /Ingresos/ })).toBeVisible();

    const sectionBoxes = await page.locator("main section").evaluateAll((sections) =>
      sections.map((section) => {
        const rect = section.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    );
    for (const box of sectionBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(width + 1);
      expect(box.width).toBeGreaterThan(0);
    }
  });
}
