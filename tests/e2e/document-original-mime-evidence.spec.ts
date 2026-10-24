import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { documentBytesMatchMimeType } from "../../src/domain/document-content-signature";

const sources = {
  pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
};
const declared = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

test("REC-DOC-SOURCE-009 · signed source bytes must prove their declared PDF/image MIME", () => {
  const entries = Object.entries(sources) as Array<[keyof typeof sources, Uint8Array]>;
  for (const [kind, bytes] of entries) {
    expect(documentBytesMatchMimeType(bytes, declared[kind]), kind).toBe(true);
    for (const [otherKind, otherMime] of Object.entries(declared)) {
      if (kind === otherKind) continue;
      expect(documentBytesMatchMimeType(bytes, otherMime), kind + " as " + otherKind).toBe(false);
    }
  }
  expect(documentBytesMatchMimeType(new Uint8Array([37, 80, 68]), "application/pdf")).toBe(false);
  expect(documentBytesMatchMimeType(new Uint8Array(0), "image/jpeg")).toBe(false);
});

test("REC-DOC-SOURCE-010 · both private original routes enforce signature before use", () => {
  const download = readFileSync(join(process.cwd(), "app/api/documents/download/route.ts"), "utf8");
  const ocr = readFileSync(join(process.cwd(), "app/api/documents/ocr/route.ts"), "utf8");
  expect(download).toContain("documentBytesMatchMimeType(bytes, detail.document.mimeType)");
  expect(download).toContain("document_download_mime_mismatch");
  expect(ocr).toContain("documentBytesMatchMimeType(bytes, mimeType)");
  expect(ocr).toContain("ocr_source_mime_mismatch");
  expect(ocr.indexOf("documentBytesMatchMimeType(bytes, mimeType)"))
    .toBeLessThan(ocr.indexOf("runDocumentOcr({"));
  expect(download.indexOf("documentBytesMatchMimeType(bytes, detail.document.mimeType)"))
    .toBeLessThan(download.indexOf("return new Response(bytes, {"));
});
