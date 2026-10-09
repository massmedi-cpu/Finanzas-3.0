import { expect, test, type Page } from "@playwright/test";

const fixtureId = "a0d20000-0000-4000-8000-000000000011";
const ordinaryId = "a0d20000-0000-4000-8000-000000000012";
const principles = {
  bankSource: "read_only", ocrEnabled: true, getHasSideEffects: false,
  suggestionsPersisted: false, associationsRequireConfirmation: true,
  testDesignationSupported: true, testDesignationEditable: true,
};
const base = {
  type: "other", status: "pending_review", mimeType: "image/png", notes: "",
  createdAt: "2026-09-06T20:00:00Z", updatedAt: "2026-09-06T20:00:00Z", sizeBytes: 1234,
  issuerName: null, totalCents: null, documentDate: null, storageProvider: "google_drive",
  associationCount: 0, sourceModifiedAt: null, sourceDriveFileId: "synthetic-only",
  isTest: false, testDesignationReason: null as string | null, testDesignationUpdatedAt: null as string | null,
};

async function documents(page: Page, options: { fail?: boolean; editable?: boolean; mismatched?: boolean } = {}) {
  const writes: any[] = [];
  const reads: string[] = [];
  const fixture = { ...base, id: fixtureId, originalFileName: "F11_DRIVE_LIVE_OCR_TEST.png", notes: "Fixture sintético F11: declaración pendiente de revisión" };
  const ordinary = { ...base, id: ordinaryId, originalFileName: "Mi factura.png" };
  await page.route("**/api/**", r => r.fulfill({ status: 503, json: { error: "isolated_source_unavailable" } }));
  await page.route("**/api/documents/drive-sync", r => r.fulfill({ json: { found: 0, imported: 0 } }));
  await page.route("**/api/documents/ocr-review*", r => r.fulfill({ json: { runs: [], reviews: [] } }));
  await page.route(/\/api\/documents(?:\?.*)?$/, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      writes.push(body);
      if (options.fail) return route.fulfill({ status: 503, json: { error: "persistence_failed" } });
      if (options.mismatched) return route.fulfill({ json: { contractVersion: 3, document: ordinary, associations: [], principles } });
      fixture.isTest = body.isTest;
      fixture.testDesignationReason = body.reason;
      fixture.testDesignationUpdatedAt = "2026-10-08T15:00:00Z";
      return route.fulfill({ json: { contractVersion: 3, document: fixture, associations: [], principles } });
    }
    reads.push(request.url());
    if (url.searchParams.has("id")) {
      const item = url.searchParams.get("id") === fixtureId ? fixture : ordinary;
      return route.fulfill({ json: { contractVersion: 3, document: item, associations: [], principles: { ...principles, testDesignationEditable: options.editable !== false } } });
    }
    const scope = url.searchParams.get("scope") ?? "ordinary";
    const items = [fixture, ordinary].filter(d => scope === "all" || d.isTest === (scope === "tests"));
    return route.fulfill({ json: { contractVersion: 3, total: items.length, items, testCount: fixture.isTest ? 1 : 0, limit: 50, offset: 0, principles } });
  });
  return { writes, reads };
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [360, 390, 768, 820, 1024, 1348, 1440]) {
    test(`DOC-002 explicit owner review and reversal, ${theme} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 936 });
      await page.addInitScript(({ theme }) => { localStorage.setItem("financial-app.theme", theme); }, { theme });
      const { writes } = await documents(page);
      await page.goto("/documents");
      await page.locator('html').evaluate((element, value) => element.setAttribute('data-theme', value), theme);
      await page.getByRole("button", { name: /F11_DRIVE_LIVE_OCR_TEST/ }).click({ noWaitAfter: true });
      await expect(page.getByTestId("document-synthetic-note")).toBeVisible();
      expect(writes).toHaveLength(0);
      await page.getByText("Cambiar tratamiento documental", { exact: true }).click();
      const save = page.getByRole("button", { name: "Designar como Prueba", exact: true });
      await expect(save).toBeDisabled();
      await page.getByLabel("Motivo de la revisión").fill("He comprobado que es una prueba sin datos personales.");
      await expect(save).toBeDisabled();
      await page.getByRole("checkbox", { name: /He revisado este documento/ }).check();
      await save.click();
      await expect(page.getByLabel("Vista documental")).toHaveValue("tests");
      await expect(page.getByTestId("document-test-designation")).toContainText("Prueba · designación revisada");
      await expect(page).toHaveURL(/scope=tests/);
      await page.reload();
      await expect(page.getByLabel("Vista documental")).toHaveValue("tests");
      await page.getByRole("button", { name: /F11_DRIVE_LIVE_OCR_TEST/ }).click({ noWaitAfter: true });
      await page.getByText("Cambiar tratamiento documental", { exact: true }).click();
      await page.getByLabel("Motivo de la revisión").fill("Restauro su tratamiento ordinario tras revisar el documento.");
      await page.getByRole("checkbox", { name: /He revisado este documento/ }).check();
      await page.getByRole("button", { name: "Devolver a documentos ordinarios", exact: true }).click();
      await expect(page.getByLabel("Vista documental")).toHaveValue("ordinary");
      await expect(page.getByRole("button", { name: /Mi factura/ })).toBeVisible();
      expect(writes.map(w => ({ action: w.action, id: w.id, isTest: w.isTest, ownerReviewed: w.ownerReviewed }))).toEqual([
        { action: "test_designation", id: fixtureId, isTest: true, ownerReviewed: true },
        { action: "test_designation", id: fixtureId, isTest: false, ownerReviewed: true },
      ]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      expect(overflow).toBe(false);
    });
  }
}

test("DOC-002 failed save preserves review draft; cancellation writes nothing", async ({ page }) => {
  const { writes } = await documents(page, { fail: true });
  await page.goto("/documents");
  await page.getByRole("button", { name: /F11_DRIVE_LIVE_OCR_TEST/ }).click();
  await page.getByText("Cambiar tratamiento documental", { exact: true }).click();
  await page.getByLabel("Motivo de la revisión").fill("Mi motivo revisado");
  await page.getByRole("checkbox", { name: /He revisado este documento/ }).check();
  await page.getByRole("button", { name: "Designar como Prueba", exact: true }).click();
  await expect(page.getByTestId("documents-alert")).toBeVisible();
  await expect(page.getByLabel("Motivo de la revisión")).toHaveValue("Mi motivo revisado");
  await expect(page.getByRole("checkbox", { name: /He revisado este documento/ })).toBeChecked();
  await expect(page.getByLabel("Vista documental")).toHaveValue("ordinary");
  await page.getByRole("button", { name: "Cancelar cambio" }).click();
  expect(writes).toHaveLength(1);
  await expect(page.getByTestId("document-synthetic-note")).toBeVisible();
});

test("DOC-002 member can read designation but cannot start owner confirmation", async ({ page }) => {
  const { writes } = await documents(page, { editable: false });
  await page.goto("/documents");
  await page.getByRole("button", { name: /F11_DRIVE_LIVE_OCR_TEST/ }).click();
  await page.getByText("Cambiar tratamiento documental", { exact: true }).click();
  await expect(page.getByText("El propietario del espacio debe revisar y confirmar este cambio.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Designar como Prueba", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("DOC-002 refuses success for a different returned document and preserves the draft", async ({ page }) => {
  await documents(page, { mismatched: true });
  await page.goto("/documents");
  await page.getByRole("button", { name: /F11_DRIVE_LIVE_OCR_TEST/ }).click();
  await page.getByText("Cambiar tratamiento documental", { exact: true }).click();
  await page.getByLabel("Motivo de la revisión").fill("Revisión del documento seleccionado");
  await page.getByRole("checkbox", { name: /He revisado este documento/ }).check();
  await page.getByRole("button", { name: "Designar como Prueba", exact: true }).click();
  await expect(page.getByTestId("documents-alert")).toContainText("No se ha podido comprobar el cambio");
  await expect(page.getByLabel("Motivo de la revisión")).toHaveValue("Revisión del documento seleccionado");
  await expect(page.getByLabel("Vista documental")).toHaveValue("ordinary");
  await expect(page.getByRole("heading", { name: "F11_DRIVE_LIVE_OCR_TEST.png" })).toBeVisible();
});

test("DOC-002 API rejects absent acknowledgement, invalid scope and nonboolean designation", async ({ request }) => {
  const cases = [
    { action: "test_designation", id: fixtureId, isTest: true, ownerReviewed: false, reason: "Revisado" },
    { action: "test_designation", id: fixtureId, isTest: "true", ownerReviewed: true, reason: "Revisado" },
    { action: "test_designation", id: fixtureId, isTest: true, ownerReviewed: true, reason: " " },
  ];
  for (const data of cases) expect((await request.patch("/api/documents", { data })).status()).toBe(400);
  expect((await request.get("/api/documents?scope=automatic" )).status()).toBe(400);
  expect((await request.get("/api/documents?unassociated=maybe" )).status()).toBe(400);
});
