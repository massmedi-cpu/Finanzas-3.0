import { expect, test } from "@playwright/test";

// Mock the complete, current read-only contract. A legacy stub without
// principles masked pagination regressions by being rejected as invalid.
const principles = {
  bankSource: "read_only", ocrEnabled: true,
  getHasSideEffects: false, suggestionsPersisted: false, associationsRequireConfirmation: true,
};

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
        createdAt: "2026-10-11T08:00:00Z", updatedAt: "2026-10-11T08:00:00Z",
        sizeBytes: 1200, issuerName: null, storageProvider: "supabase",
        sourceModifiedAt: null, sourceDriveFileId: null,
      }));
      await route.fulfill({ json: { contractVersion: 3, total, offset, limit, items, testCount: 0, principles } });
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


// A legacy v2 backend ignores the unassociated filter. The client must
// reconstruct a complete, stable inventory before filtering, without skipping
// records when the user opens a deep link to a later page.
const legacyRows = Array.from({ length: 145 }, (_, index) => ({
  id: `a0d30000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  originalFileName: `Documento ${index + 1}.png`,
  type: "other", status: "pending_review", mimeType: "image/png", notes: "",
  documentDate: null, totalCents: null, associationCount: index < 20 ? 1 : 0,
  createdAt: "2026-10-11T08:00:00Z", updatedAt: "2026-10-11T08:00:00Z",
  sizeBytes: 1200, issuerName: null, storageProvider: "supabase",
  sourceModifiedAt: null, sourceDriveFileId: null,
}));

test("NAV-002 · filtro legado sin asociados conserva página 3 sin saltos ni duplicados", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { error: "isolated_source_unavailable" } }));
  const requests: Array<[number, number]> = [];
  await page.route(/\/api\/documents(?:\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    requests.push([offset, limit]);
    await route.fulfill({ json: {
      contractVersion: 2, total: legacyRows.length, offset, limit,
      items: legacyRows.slice(offset, offset + limit), principles,
    } });
  });
  await page.goto("/documents?unassociated=true&offset=100");
  const pagination = page.getByRole("navigation", { name: "Paginación documental" });
  await expect(pagination).toContainText("Mostrando 101–125 de 125");
  await expect(page.getByRole("button", { name: /Documento 121\.png/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Documento 145\.png/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Documento 101\.png/ })).toHaveCount(0);
  expect(requests).toContainEqual([0, 100]);
  expect(requests).toContainEqual([100, 100]);
  await pagination.getByRole("button", { name: "Página anterior" }).click();
  await expect(pagination).toContainText("Mostrando 51–100 de 125");
  await expect(page.getByRole("button", { name: /Documento 71\.png/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Documento 120\.png/ })).toBeVisible();
});

test("NAV-003 · inventario legado duplicado no se presenta como filtrado fiable", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { error: "isolated_source_unavailable" } }));
  await page.route(/\/api\/documents(?:\?.*)?$/, async route => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const items = legacyRows.slice(offset, offset + limit).map(item => ({ ...item }));
    if (offset === 100 && limit === 100) items[0].id = legacyRows[0].id;
    await route.fulfill({ json: {
      contractVersion: 2, total: legacyRows.length, offset, limit, items, principles,
    } });
  });
  await page.goto("/documents?unassociated=true");
  await expect(page.getByText("La lista recibida está incompleta.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Documento 121\.png/ })).toHaveCount(0);
});
