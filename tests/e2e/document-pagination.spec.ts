import { expect, test } from "@playwright/test";

for (const width of [360, 1440]) {
  test(`NAV-001 document pagination, reload and filter reset at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 936 });
    await page.route("**/api/**", r => r.fulfill({ status: 503, json: { error: "isolated_source_unavailable" } }));
    await page.route("**/api/documents/drive-sync", r => r.fulfill({ json: { imported: 0 } }));
    const requests: URL[] = [];
    await page.route(/\/api\/documents(?:\?.*)?$/, async route => {
      const url = new URL(route.request().url());
      requests.push(url);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const total = url.searchParams.has("q") ? 1 : 57;
      const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
        id: `a0d30000-0000-4000-8000-${String(offset + i + 1).padStart(12, "0")}`,
        originalFileName: `Documento ${offset + i + 1}.png`,
        type: "other", status: "pending_review", mimeType: "image/png", notes: "",
        documentDate: null, totalCents: null, associationCount: 0, isTest: false,
      }));
      await route.fulfill({ json: { contractVersion: 3, total, offset, limit, items, testCount: 0 } });
    });
    await page.goto("/documents?unassociated=true");
    const pagination = page.getByRole("navigation", { name: "Paginación documental" });
    await expect(pagination).toContainText("Mostrando 1–50 de 57");
    await expect(pagination.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    await pagination.getByRole("button", { name: "Página siguiente" }).click({ noWaitAfter: true });
    await expect(pagination).toContainText("Mostrando 51–57 de 57");
    await expect(page.getByRole("button", { name: /Documento 57\.png/ })).toBeVisible();
    await expect(pagination.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
    await expect(page).toHaveURL(/offset=50/);
    await page.reload();
    await expect(pagination).toContainText("Mostrando 51–57 de 57");
    expect(requests.at(-1)?.searchParams.get("unassociated")).toBe("true");
    await page.getByLabel("Buscar", { exact: true }).fill("Documento 1");
    await expect(pagination).toContainText("Mostrando 1–1 de 1");
    await expect(page).not.toHaveURL(/offset=/);
    expect(requests.at(-1)?.searchParams.get("offset")).toBe("0");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.goto("/documents?unassociated=true&offset=1000");
    await expect(pagination).toContainText("Mostrando 1–50 de 57");
    await expect(page).not.toHaveURL(/offset=/);
  });
}
