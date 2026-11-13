import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
// Playwright transpiles spec imports through its runner; a normal TS namespace
// import did not expose ScriptTarget, even after unwrapping .default. Load the
// installed CommonJS TypeScript compiler with Node's native require instead.
const ts = createRequire(process.cwd() + "/package.json")("typescript") as typeof import("typescript");

const ID = "93000000-0000-4000-8000-000000000258";
const principles = { bankSource: "read_only", ocrEnabled: false, getHasSideEffects: false, suggestionsPersisted: false, associationsRequireConfirmation: true };
const document = {
  id: ID, originalFileName: "BORRADO-SINTETICO-258.pdf", type: "invoice",
  status: "pending_review", mimeType: "application/pdf", sizeBytes: 1900,
  createdAt: "2026-11-12T12:00:00Z", updatedAt: "2026-11-12T12:00:00Z",
  issuerName: null, totalCents: 1900, documentDate: "2026-11-12",
  storageProvider: "supabase", associationCount: 0, notes: "",
  sourceModifiedAt: null, sourceDriveFileId: null,
};

test("REC-DOC-DELETE-258 · retry is ID-only; gateway must recover a scoped SQL audit receipt", () => {
  const gateway = readFileSync("supabase/functions/financial-app-db-gateway/document-delete-logic.ts", "utf8");
  const route = readFileSync("app/api/documents/delete/route.ts", "utf8");
  const parsed = ts.transpileModule(gateway, {
    fileName: "document-delete-logic.ts", reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  expect((parsed.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error))
    .toHaveLength(0);
  expect(gateway).toContain("return value.toLowerCase()");
  expect(gateway).toContain("const publicResult =");
  expect(gateway).not.toContain("json({ ...deleted");
  expect(gateway).not.toContain("json({ ...deleted, ...cleaned");
  expect(gateway).toContain('action === "document.delete_cleanup"');
  expect(gateway).toContain("financial_app.require_current_workspace_id()");
  expect(gateway).toContain("entity_type='document' and entity_id=");
  expect(gateway).toContain("field_name='deleted' and change_origin='user'");
  expect(gateway).toContain("original_value->>'storageKey'");
  expect(gateway).toContain("document_delete_cleanup_unsafe_receipt");
  expect(gateway).toContain("document_delete_cleanup_referenced");
  expect(gateway).toContain("pg_advisory_xact_lock");
  expect(gateway).toContain("storage.remove([path])");
  expect(gateway).toContain("storage.list(folder");
  expect(gateway).not.toContain("payload?.storageKey");
  expect(route).toContain('callPersistenceGateway("document.delete_cleanup", { id })');
  expect(route).toContain('const id = documentId(request)');
});

test("REC-DOC-DELETE-259 · owner confirmation, uncertain cleanup and reload-safe ID retry", async ({ page }) => {
  let registered = true;
  let removeAttempts = 0;
  const writes: string[] = [];
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") {
      writes.push("unexpected-document-write");
      await route.fulfill({ status: 409, contentType: "application/json", body: '{"error":"no_writes_expected"}' });
      return;
    }
    if (url.searchParams.has("id")) {
      await route.fulfill({ status: registered ? 200 : 404, contentType: "application/json",
        body: JSON.stringify(registered
          ? { contractVersion: 3, document, associations: [], principles }
          : { error: "document_not_found" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ contractVersion: 3, items: registered ? [document] : [],
        total: registered ? 1 : 0, testCount: 0, offset: 0, limit: 50, principles }) });
  });
  await page.route(/\/api\/documents\/delete\?.*$/, async (route) => {
    const method = route.request().method();
    const id = new URL(route.request().url()).searchParams.get("id");
    expect(id).toBe(ID);
    writes.push(method);
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"canDelete":true}' });
    } else if (method === "DELETE") {
      registered = false;
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ deleted: true, documentId: ID, storageCleanupPending: true }) });
    } else if (method === "POST") {
      removeAttempts += 1;
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ deleted: true, documentId: ID, storageCleanupPending: false }) });
    } else {
      await route.fulfill({ status: 405 });
    }
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: /BORRADO-SINTETICO-258\.pdf/ }).click();
  const deleteButton = page.getByRole("button", { name: "Eliminar documento" });
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  const dialog = page.getByRole("alertdialog", { name: "Confirmar eliminación" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Eliminar ficha" })).toBeDisabled();
  expect(writes).toEqual(["GET"]);
  await dialog.getByRole("checkbox", { name: /He comprobado la ficha/ }).check();
  await dialog.getByRole("button", { name: "Eliminar ficha" }).click();
  await expect(page.getByTestId("document-delete-recovery")).toBeVisible();
  expect(writes).toEqual(["GET", "DELETE"]);
  await page.reload();
  await expect(page.getByTestId("document-delete-recovery")).toBeVisible();
  await page.getByRole("button", { name: "Reintentar limpieza" }).click();
  await expect(page.getByTestId("document-delete-recovery")).toHaveCount(0);
  await expect(page.getByTestId("documents-repository-empty")).toBeVisible();
  expect(writes).toEqual(["GET", "DELETE", "POST"]);
  expect(removeAttempts).toBe(1);
});


test("REC-DOC-DELETE-275 · malformed 200 cannot erase a pending delete journal", async ({ page }) => {
  let responseIsValid = false;
  const writes: string[] = [];
  await page.addInitScript(({ key, id }) => {
    localStorage.setItem(key, id);
  }, { key: "financial-app:documents:pending-delete-cleanup:v1", id: ID });
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("id")) {
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(responseIsValid
          ? { contractVersion: 3, document: { id: ID }, associations: [], principles }
          : { ok: true, documentId: "other-document" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ contractVersion: 3, items: [], total: 0, offset: 0,
        limit: 50, testCount: 0, principles }) });
  });
  await page.route(/\/api\/documents\/delete\?.*$/, async (route) => {
    writes.push(route.request().method());
    await route.fulfill({ status: 404, contentType: "application/json",
      body: '{"error":"document_delete_cleanup_not_found"}' });
  });
  await page.goto("/documents");
  const banner = page.getByTestId("document-delete-recovery");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Reintentar limpieza" }).click();
  await expect(banner).toBeVisible();
  await expect(page.getByTestId("documents-alert")).toBeVisible();
  expect(writes).toEqual(["POST"]);

  responseIsValid = true;
  await banner.getByRole("button", { name: "Reintentar limpieza" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId("documents-alert")).toContainText("La ficha sigue existiendo");
  expect(writes).toEqual(["POST", "POST"]);
});
