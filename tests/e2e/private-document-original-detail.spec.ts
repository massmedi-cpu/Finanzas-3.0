import { expect, test } from "@playwright/test";
import { isPrivateDocumentOriginalDetailForId } from "../../src/application/private-document-original-detail";

const id = "93000000-0000-4000-8000-000000000117";
const nextId = "93000000-0000-4000-8000-000000000118";

const original = {
  document: {
    id,
    mimeType: "application/pdf",
    originalFileName: "factura.pdf",
    storageProvider: "supabase",
    sourceDriveFileId: null,
  },
};

test("REC-DOC-ID-001 · sólo el original del documento solicitado puede alimentar descarga u OCR", () => {
  expect(isPrivateDocumentOriginalDetailForId(original, id)).toBe(true);
  expect(isPrivateDocumentOriginalDetailForId(original, nextId)).toBe(false);
  expect(isPrivateDocumentOriginalDetailForId({
    ...original, document: { ...original.document, id: nextId },
  }, id)).toBe(false);
});

test("REC-DOC-ID-002 · origen y metadatos privados mal formados fallan cerrados", () => {
  const invalid = [
    null, {}, { document: null }, { document: [] },
    { document: { ...original.document, mimeType: "" } },
    { document: { ...original.document, originalFileName: "" } },
    { document: { ...original.document, storageProvider: "http" } },
    { document: { ...original.document, sourceDriveFileId: 123 } },
  ];
  for (const value of invalid) {
    expect(isPrivateDocumentOriginalDetailForId(value, id)).toBe(false);
  }
  expect(isPrivateDocumentOriginalDetailForId({
    document: { ...original.document, storageProvider: "google_drive", sourceDriveFileId: "drive-file-123" },
  }, id)).toBe(true);
});
