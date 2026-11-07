import { expect, test } from "@playwright/test";

// Select only against the separately built DOCUMENTS=deferred candidate.
// API stubs below exercise unavailable states; they do not certify real money.
test.beforeAll(async ({ request }) => {
  expect((await (await request.get("/api/build")).json()).releaseFeatures).toEqual({
    documents: false, documentOcr: false, documentDriveSync: false,
  });
});

test("REC-REL-383 · direct document URLs and every exposed HTTP method stay closed in optimized build", async ({ request, page }) => {
  for (const [path, method] of [
    ["/api/documents", "GET"], ["/api/documents", "POST"], ["/api/documents", "PATCH"],
    ["/api/documents/delete", "GET"], ["/api/documents/delete", "DELETE"],
    ["/api/documents/download", "GET"], ["/api/documents/ocr", "GET"],
    ["/api/documents/ocr", "POST"], ["/api/documents/drive-sync", "POST"],
    ["/api/transactions?hasDocument=true", "GET"],
    ["/api/transactions?documentQuery=synthetic", "GET"],
    ["/api/transactions?ocrQuery=synthetic", "GET"],
  ]) {
    const response = await request.fetch(path, { method });
    expect(response.status(), method + " " + path).toBe(404);
    expect(await response.json()).toEqual({ error: "feature_deferred", code: null });
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  // The existing private OCR history boundary keeps authentication first.
  for (const method of ["GET", "PATCH"]) {
    const response = await request.fetch("/api/documents/ocr-review?id=synthetic", { method });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication_required" });
  }
  await page.goto("/documents?documentId=synthetic&scope=all");
  await expect(page.getByRole("heading", { name: "Esta página no existe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Documentos", exact: true })).toHaveCount(0);
});

for (const width of [360, 390, 768, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`REC-REL-384 · no document entry points or background reads · ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript(() => localStorage.setItem("financial-app:mobile-favorite", "/documents"));
      const documentReads: string[] = [];
      const errors: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/documents")) documentReads.push(request.url());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/**", async (route) => {
        if (new URL(route.request().url()).pathname === "/api/build") return route.continue();
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"isolated_scope_test"}' });
      });
      for (const path of ["/review", "/alerts", "/transactions?hasDocument=true&documentQuery=stale&ocrQuery=stale"]) {
        await page.goto(path);
        await expect(page.locator('a[href^="/documents"]')).toHaveCount(0);
        await expect(page.getByText("Documentos pendientes", { exact: true })).toHaveCount(0);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        if (path.startsWith("/transactions")) {
          await page.getByRole("button", { name: "Más filtros", exact: true }).click();
          await expect(page.getByLabel("Documentos", { exact: true })).toHaveCount(0);
          await expect(page.getByLabel("Buscar en documento", { exact: true })).toHaveCount(0);
          await expect(page.getByTestId("ocr-filter")).toHaveCount(0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: info.outputPath(`${path.split("?")[0].slice(1)}-${width}-${theme}.png`), fullPage: true });
      }
      if (width < 600) {
        await page.getByRole("button", { name: "Más", exact: true }).click();
        await expect(page.getByLabel("Acceso favorito")).toHaveValue("/review");
        await expect(page.locator('#mobile-favorite-section option[value="/documents"]')).toHaveCount(0);
        await expect(page.locator('a[href^="/documents"]')).toHaveCount(0);
      }
      expect(documentReads).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("REC-REL-385 · stale search response cannot reintroduce a hidden document or section", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/build") return route.continue();
    if (url.pathname !== "/api/search") return route.fulfill({ status: 503, body: "{}" });
    return route.fulfill({ json: { query: url.searchParams.get("q"), partial: false, items: [
      { id: "document:synthetic", kind: "document", title: "Documento oculto", subtitle: null, href: "/documents?documentId=synthetic" },
      { id: "section:documents", kind: "section", title: "Sección oculta", subtitle: null, href: "/documents" },
      { id: "section:accounts", kind: "section", title: "Cuentas", subtitle: null, href: "/accounts" },
    ] } });
  });
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Buscar en Financial App" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox")).toHaveAttribute("placeholder", "Comercio, categoría, movimiento…");
  await dialog.getByRole("combobox").fill("cuentas");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await expect(dialog.getByRole("option")).toContainText("Cuentas");
  await expect(dialog.locator('a[href^="/documents"]')).toHaveCount(0);
});
