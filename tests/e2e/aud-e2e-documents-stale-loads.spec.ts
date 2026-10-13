import { expect, test, type Page } from "@playwright/test";

const DOCS = [
  {
    id: "93000000-0000-4000-8000-000000000091",
    originalFileName: "Primera factura.pdf",
    type: "invoice",
    notes: "",
    status: "pending_review",
    mimeType: "application/pdf",
    createdAt: "2026-09-12T09:00:00Z",
    updatedAt: "2026-09-12T09:00:00Z",
    sizeBytes: 1200,
    issuerName: "Comercio primero",
    totalCents: 1250,
    documentDate: "2026-09-12",
    storageProvider: "supabase",
    associationCount: 0,
    sourceModifiedAt: null,
    sourceDriveFileId: null,
  },
  {
    id: "93000000-0000-4000-8000-000000000092",
    originalFileName: "Segunda factura.pdf",
    type: "invoice",
    notes: "",
    status: "pending_review",
    mimeType: "application/pdf",
    createdAt: "2026-09-13T09:00:00Z",
    updatedAt: "2026-09-13T09:00:00Z",
    sizeBytes: 1300,
    issuerName: "Comercio segundo",
    totalCents: 2500,
    documentDate: "2026-09-13",
    storageProvider: "supabase",
    associationCount: 0,
    sourceModifiedAt: null,
    sourceDriveFileId: null,
  },
] as const;

const PRINCIPLES = {
  bankSource: "read_only",
  ocrEnabled: false,
  getHasSideEffects: false,
  suggestionsPersisted: false,
  associationsRequireConfirmation: true,
  testDesignationSupported: false,
};

function list<T extends { originalFileName: string }>(items: readonly T[], requestUrl: URL) {
  const offset = Number(requestUrl.searchParams.get("offset") ?? "0");
  const limit = Number(requestUrl.searchParams.get("limit") ?? "50");
  return {
    contractVersion: 3,
    total: items.length,
    testCount: 0,
    offset,
    limit,
    items: items.slice(offset, offset + limit),
    principles: PRINCIPLES,
  };
}

async function mockDocuments(page: Page, failing: { list: boolean; detail: boolean; wrongDetail?: boolean }) {
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get("id");
    if (id) {
      if (id === DOCS[1].id && failing.detail) {
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporary_failure"}' });
        return;
      }
      const doc = failing.wrongDetail && id === DOCS[1].id
        ? DOCS[0]
        : DOCS.find((item) => item.id === id);
      await route.fulfill({
        status: doc ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify({ contractVersion: 3, document: doc ?? null, associations: [], principles: PRINCIPLES }),
      });
      return;
    }
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    if (q === "segunda" && failing.list) {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporary_failure"}' });
      return;
    }
    const items = DOCS.filter((doc) => !q || doc.originalFileName.toLowerCase().includes(q));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(list(items, url)) });
  });
}

test("AUD-E2E-DOC-001 · un filtro fallido no expone registros ni paginación de la consulta anterior", async ({ page }) => {
  const failing = { list: true, detail: false };
  await mockDocuments(page, failing);
  await page.goto("/documents");
  const archive = page.getByRole("complementary", { name: "Listado de documentos" });
  await expect(archive.getByRole("button", { name: /Primera factura\.pdf/ })).toBeVisible();
  await archive.getByRole("textbox", { name: "Buscar" }).fill("segunda");

  const failed = archive.getByTestId("documents-list-error");
  await expect(failed).toBeVisible();
  await expect(archive.getByRole("button", { name: /Primera factura\.pdf/ })).toHaveCount(0);
  await expect(archive.getByText("No hay coincidencias")).toHaveCount(0);
  await expect(archive.getByRole("navigation", { name: "Paginación documental" })).toHaveCount(0);

  failing.list = false;
  await failed.getByRole("button", { name: "Reintentar lista" }).click();
  await expect(archive.getByRole("button", { name: /Segunda factura\.pdf/ })).toBeVisible();
  await expect(archive.getByRole("button", { name: /Primera factura\.pdf/ })).toHaveCount(0);
  await expect(failed).toHaveCount(0);
});

test("AUD-E2E-DOC-001 · un fallo de detalle no muestra metadatos del documento anterior", async ({ page }) => {
  const failing = { list: false, detail: true };
  await mockDocuments(page, failing);
  await page.goto("/documents");
  const archive = page.getByRole("complementary", { name: "Listado de documentos" });
  await archive.getByRole("button", { name: /Primera factura\.pdf/ }).click();
  await expect(page.getByRole("heading", { name: "Primera factura.pdf" })).toBeVisible();

  await archive.getByRole("button", { name: /Segunda factura\.pdf/ }).click();
  const failure = page.getByTestId("documents-detail-error");
  await expect(failure).toBeVisible();
  await expect(page.getByRole("heading", { name: "Primera factura.pdf" })).toHaveCount(0);
  await expect(page.getByText("Comercio primero")).toHaveCount(0);

  failing.detail = false;
  await failure.getByRole("button", { name: "Reintentar detalle" }).click();
  await expect(page.getByRole("heading", { name: "Segunda factura.pdf" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Primera factura.pdf" })).toHaveCount(0);
});

test("AUD-E2E-DOC-001 · fecha imposible se rechaza sin inventar listado y permite reintentar", async ({ page }) => {
  let invalidDate = true;
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const invalid = { ...DOCS[0], documentDate: invalidDate ? "2026-02-30" : "2026-02-28" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.get("id")
        ? { contractVersion: 3, document: invalid, associations: [], principles: PRINCIPLES }
        : list([invalid], url)),
    });
  });
  await page.goto("/documents");
  const archive = page.getByRole("complementary", { name: "Listado de documentos" });
  const failure = archive.getByTestId("documents-list-error");
  await expect(failure).toBeVisible();
  await expect(archive.getByRole("button", { name: /Primera factura\.pdf/ })).toHaveCount(0);
  invalidDate = false;
  await failure.getByRole("button", { name: "Reintentar lista" }).click();
  await expect(archive.getByRole("button", { name: /Primera factura\.pdf/ })).toBeVisible();
  await expect(failure).toHaveCount(0);
});


test("AUD-E2E-DOC-001 · Guardar y continuar espera a verificar relectura y conserva el borrador si falla", async ({ page }) => {
  let updatedIssuer = DOCS[0].issuerName as string;
  let failRevalidation = true;
  let needRevalidation = false;
  let returnOldMetadata = false;
  let patches = 0;
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const id = url.searchParams.get("id");
    if (req.method() === "PATCH") {
      const payload = req.postDataJSON() as { action: string; issuerName: string };
      expect(payload.action).toBe("metadata");
      patches += 1;
      updatedIssuer = payload.issuerName;
      needRevalidation = failRevalidation;
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
      return;
    }
    if (id === DOCS[0].id && needRevalidation) {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporary_failure"}' });
      return;
    }
    if (id) {
      const source = DOCS.find((doc) => doc.id === id);
      await route.fulfill({
        status: source ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 3,
          document: source ? { ...source, issuerName: source.id === DOCS[0].id ? (returnOldMetadata ? DOCS[0].issuerName : updatedIssuer) : source.issuerName } : null,
          associations: [],
          principles: PRINCIPLES,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(list(DOCS, url)),
    });
  });

  await page.goto("/documents");
  const archive = page.getByRole("complementary", { name: "Listado de documentos" });
  await archive.getByRole("button", { name: /Primera factura\.pdf/ }).click();
  const issuer = page.getByRole("textbox", { name: "Emisor" });
  await expect(issuer).toHaveValue(DOCS[0].issuerName);
  await issuer.fill("Proveedor revisado");
  await archive.getByRole("button", { name: /Segunda factura\.pdf/ }).click();

  const dialog = page.getByRole("alertdialog", { name: "Cambios sin guardar" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("no se pudo comprobar");
  // Failed detail verification blocks stale controls but must not silently
  // turn the unsaved draft into a clean form or release the unload guard.
  await expect(issuer).toHaveCount(0);
  await expect(page.getByTestId("documents-draft-protected")).toBeVisible();
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  expect(patches).toBe(1);

  // The user can dismiss the modal to recover the detail manually. This
  // must NOT overwrite "Proveedor revisado" with stale persisted metadata.
  await dialog.getByRole("button", { name: "Seguir editando" }).click();
  await expect(page.getByTestId("documents-detail-error")).toBeVisible();
  failRevalidation = false;
  needRevalidation = false;
  returnOldMetadata = true;
  await page.getByTestId("documents-detail-error")
    .getByRole("button", { name: "Reintentar detalle" }).click();
  await expect(issuer).toHaveValue("Proveedor revisado");
  await expect(page.getByTestId("document-metadata-dirty")).toBeVisible();

  await archive.getByRole("button", { name: /Segunda factura\.pdf/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(dialog.getByRole("alert")).toContainText("no se pudo comprobar");
  await expect(issuer).toHaveValue("Proveedor revisado");
  expect(patches).toBe(2);

  returnOldMetadata = false;
  await dialog.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Segunda factura.pdf" })).toBeVisible();
  expect(patches).toBe(3);
});


test("REC-DOC-027 · PATCH aplicado pero listado 503 no pierde el borrador ni repite el PATCH", async ({ page }) => {
  let savedIssuer = DOCS[0].issuerName as string;
  let listUnavailable = false;
  let listReturnsStale = false;
  let writes = 0;
  let listReads = 0;
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const id = url.searchParams.get("id");
    if (req.method() === "PATCH") {
      const change = req.postDataJSON() as { action: string; issuerName: string };
      expect(change.action).toBe("metadata");
      savedIssuer = change.issuerName;
      writes += 1;
      // Simulates an already committed write, but the archive remains
      // temporarily unavailable while detail GET reflects the new value.
      listUnavailable = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
      return;
    }
    if (id) {
      const source = DOCS.find((doc) => doc.id === id);
      await route.fulfill({
        status: source ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify({
          contractVersion: 3,
          document: source ? {
            ...source,
            issuerName: source.id === DOCS[0].id ? savedIssuer : source.issuerName,
          } : null,
          associations: [],
          principles: PRINCIPLES,
        }),
      });
      return;
    }
    listReads += 1;
    if (listUnavailable) {
      await route.fulfill({
        status: 503, contentType: "application/json",
        body: '{"error":"temporary_archive_failure"}',
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(list(DOCS.map((doc) => doc.id === DOCS[0].id && !listReturnsStale
        ? { ...doc, issuerName: savedIssuer } : doc), url)),
    });
  });

  await page.goto("/documents");
  const archive = page.getByRole("complementary", { name: "Listado de documentos" });
  await archive.getByRole("button", { name: /Primera factura\.pdf/ }).click();
  const issuer = page.getByRole("textbox", { name: "Emisor" });
  await expect(issuer).toHaveValue(DOCS[0].issuerName);
  await issuer.fill("Emisor contrastado");
  await archive.getByRole("button", { name: /Segunda factura\.pdf/ }).click();
  const dialog = page.getByRole("alertdialog", { name: "Cambios sin guardar" });
  await dialog.getByRole("button", { name: "Guardar y continuar" }).click();

  await expect(dialog.getByRole("alert")).toContainText("no se pudo comprobar");
  await expect(issuer).toHaveValue("Emisor contrastado");
  await expect(page.getByTestId("document-metadata-dirty")).toBeVisible();
  expect(writes).toBe(1);

  // An HTTP 200 list still cannot certify the mutation if its item contains
  // the OLD issuer. Both responses must agree on the stored document.
  listUnavailable = false;
  listReturnsStale = true;
  await dialog.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("falta verificar el documento y el listado");
  expect(writes).toBe(1);
  // Once the archive reflects the same committed issuer as the detail, two
  // GETs certify the previous PATCH without sending the write a second time.
  listReturnsStale = false;
  await dialog.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Segunda factura.pdf" })).toBeVisible();
  expect(writes).toBe(1);
  expect(listReads).toBeGreaterThanOrEqual(4);
});

test("AUD-E2E-UI-001 · Documentos espera una pausa antes de consultar mientras escribimos", async ({ page }) => {
  const requestedQueries: string[] = [];
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q") ?? "";
    if (query) requestedQueries.push(query);
    const filtered = DOCS.filter((item) => !query || item.originalFileName.toLowerCase().includes(query.toLowerCase()));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(list(filtered, url)),
    });
  });

  await page.goto("/documents");
  const archive = page.getByRole("complementary", { name: "Listado de documentos" });
  await expect(archive.getByRole("button", { name: /Primera factura\.pdf/ })).toBeVisible();
  const search = archive.getByRole("textbox", { name: "Buscar" });
  await search.press("s");
  await expect(archive.getByRole("button", { name: /Primera factura\.pdf/ })).toHaveCount(0);
  await search.pressSequentially("egunda", { delay: 20 });
  await expect(archive.getByRole("button", { name: /Segunda factura\.pdf/ })).toBeVisible();
  expect(requestedQueries.at(-1)).toBe("segunda");
  // Un runner lento puede superar el debounce entre teclas; evita depender de su reloj,
  // pero bloquea regresar a una petición por pulsación.
  expect(requestedQueries.length).toBeLessThanOrEqual(3);
});


test("AUD-E2E-DOC-001 · una respuesta 200 con ID ajeno no reemplaza el documento seleccionado", async ({ page }) => {
  const failing = { list: false, detail: false, wrongDetail: true };
  await mockDocuments(page, failing);
  await page.goto("/documents");
  const archive = page.getByRole("complementary", { name: "Listado de documentos" });
  await expect(archive.getByRole("button", { name: /Segunda factura\.pdf/ })).toBeVisible();
  await archive.getByRole("button", { name: /Segunda factura\.pdf/ }).click();
  const failure = page.getByTestId("documents-detail-error");
  await expect(failure).toBeVisible();
  await expect(page.getByTestId("documents-alert")).toContainText("no ha devuelto el documento solicitado");
  await expect(page.getByRole("heading", { name: "Primera factura.pdf" })).toHaveCount(0);

  failing.wrongDetail = false;
  await failure.getByRole("button", { name: "Reintentar detalle" }).click();
  await expect(page.getByRole("heading", { name: "Segunda factura.pdf" })).toBeVisible();
});
