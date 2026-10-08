import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasExplicitSyntheticDocumentNote } from "../../src/application/document-test-disclosure";

const documents = [
  { id: "93000000-0000-4000-8000-000000000091", originalFileName: "Justificante pendiente.pdf", type: "invoice", status: "pending_review", mimeType: "application/pdf", documentDate: "2026-09-12", totalCents: 1000, associationCount: 0 },
  { id: "93000000-0000-4000-8000-000000000092", originalFileName: "Justificante asociado.pdf", type: "invoice", status: "confirmed", mimeType: "application/pdf", documentDate: "2026-09-12", totalCents: 2000, associationCount: 1 },
  { id: "93000000-0000-4000-8000-000000000093", originalFileName: "Archivo archivado.pdf", type: "invoice", status: "archived", mimeType: "application/pdf", documentDate: "2026-09-12", totalCents: 3000, associationCount: 0 },
];

test("AUD-E2E-NAV-001 · alertas documentales enlazan a estados propios", () => {
  const alerts = readFileSync(resolve("src/application/global-alerts.ts"), "utf8");
  expect(alerts).toContain('href: "/documents?unassociated=true"');
  expect(alerts).toContain('href: "/documents?status=pending_review"');
});

test("AUD-E2E-NAV-001 · sin asociar filtra todos los resultados y permite recuperar el listado", async ({ page }) => {
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get("status");
    const filtered = status ? documents.filter((item) => item.status === status) : documents;
    const offset = Number(url.searchParams.get("offset") || "0");
    const limit = Number(url.searchParams.get("limit") || "50");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      contractVersion: 1, total: filtered.length, limit, offset, items: filtered.slice(offset, offset + limit),
    }) });
  });
  await page.goto("/documents?unassociated=true");
  await expect(page.getByLabel("Asociación")).toHaveValue("unassociated");
  await expect(page.getByText("Justificante pendiente.pdf")).toBeVisible();
  await expect(page.getByText("Justificante asociado.pdf")).toHaveCount(0);
  await expect(page.getByText("Archivo archivado.pdf")).toHaveCount(0);
  await page.getByLabel("Asociación").selectOption("all");
  await expect(page.getByText("Justificante asociado.pdf")).toBeVisible();
  await page.goto("/documents?status=pending_review");
  await expect(page.getByLabel("Estado")).toHaveValue("pending_review");
  await expect(page.getByText("Justificante pendiente.pdf")).toBeVisible();
});

test("AUD-E2E-DOC-002 · solo las notas explícitas señalan un posible fixture, nunca el nombre", () => {
  expect(hasExplicitSyntheticDocumentNote("Fixture sintético F11 para validar OCR live de Google Drive")).toBe(true);
  expect(hasExplicitSyntheticDocumentNote("  FIXTURE SINTÉTICO: datos controlados")).toBe(true);
  expect(hasExplicitSyntheticDocumentNote("")).toBe(false);
  expect(hasExplicitSyntheticDocumentNote(null)).toBe(false);
  expect(hasExplicitSyntheticDocumentNote("F11_DRIVE_LIVE_OCR_TEST.png")).toBe(false);
  expect(hasExplicitSyntheticDocumentNote("Factura: no es un fixture sintético")).toBe(false);
});

test("AUD-E2E-DOC-002 · la advertencia depende de notas confirmadas, no del nombre ni cambia documentos", async ({ page }) => {
  const fixture = {
    id: "93000000-0000-4000-8000-000000000094",
    originalFileName: "F11_DRIVE_LIVE_OCR_TEST.png",
    notes: "Fixture sintético F11 para validar OCR live de Google Drive sobre imagen",
    type: "other", status: "pending_review", mimeType: "image/png",
    documentDate: "2026-09-12", totalCents: null, associationCount: 0,
    storageProvider: "google_drive", sizeBytes: 58000,
    createdAt: "2026-09-12T09:00:00Z", updatedAt: "2026-09-12T09:00:00Z",
    sourceModifiedAt: "2026-09-12T09:00:00Z", sourceDriveFileId: "fixture-read-only",
  };
  const ordinary = {
    ...fixture,
    id: "93000000-0000-4000-8000-000000000095",
    originalFileName: "F11_DRIVE_LIVE_OCR_TEST_COPIA.png",
    notes: "Factura ordinaria documentada por el usuario",
  };
  const writes: string[] = [];
  await page.route(/\/api\/documents(?:\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      writes.push(method);
      await route.fulfill({ status: 409, contentType: "application/json", body: '{"error":"unexpected_write"}' });
      return;
    }
    const url = new URL(route.request().url());
    const id = url.searchParams.get("id");
    if (id) {
      const doc = [fixture, ordinary].find((item) => item.id === id);
      await route.fulfill({ status: doc ? 200 : 404, contentType: "application/json",
        body: JSON.stringify({ contractVersion: 1, document: doc, associations: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ contractVersion: 1, total: 2, limit: 50, offset: 0, items: [fixture, ordinary] }) });
  });

  await page.goto("/documents");
  await expect(page.getByText("Declarado como fixture en notas · sin validar")).toHaveCount(1);
  await page.getByRole("button", { name: /F11_DRIVE_LIVE_OCR_TEST\.png/ }).click();
  await expect(page.getByTestId("document-synthetic-note")).toBeVisible();
  await expect(page.getByTestId("document-synthetic-note")).toContainText("sigue incluido en los avisos ordinarios");
  await page.getByRole("button", { name: /F11_DRIVE_LIVE_OCR_TEST_COPIA\.png/ }).click();
  await expect(page.getByTestId("document-synthetic-note")).toHaveCount(0);
  expect(writes).toEqual([]);
});
