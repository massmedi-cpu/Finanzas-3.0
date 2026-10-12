import { expect, test } from "@playwright/test";
import { matchesPrivateDocumentUploadPathContract, privateDocumentContentId } from "../../src/domain/private-document-content-address";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("REC-DOC-113 · same bytes produce the same UUID across devices and reloads", () => {
  const sha = createHash("sha256").update("%PDF-1.4 Documento idéntico").digest("hex");
  const one = privateDocumentContentId(sha);
  const two = privateDocumentContentId(sha);
  expect(one).toBe(two);
  expect(one).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(privateDocumentContentId(createHash("sha256").update("%PDF-1.4 Distinto").digest("hex")))
    .not.toBe(one);
});

for (const digest of ["", "A".repeat(64), "g".repeat(64), "0".repeat(63), "0".repeat(65)]) {
  test("REC-DOC-113 · invalid digest is never converted into a private path: " + digest.length, () => {
    expect(() => privateDocumentContentId(digest)).toThrow("invalid_document_content_sha256");
  });
}

test("REC-DOC-117 · content-addressed private path must match its FULL SHA-256", () => {
  const digestA = createHash("sha256").update("archivo privado A").digest("hex");
  const digestB = createHash("sha256").update("archivo privado B").digest("hex");
  const pathA = `uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${privateDocumentContentId(digestA)}.pdf`;
  expect(matchesPrivateDocumentUploadPathContract(pathA, digestA)).toBe(true);
  expect(matchesPrivateDocumentUploadPathContract(pathA, digestB)).toBe(false);
  expect(matchesPrivateDocumentUploadPathContract(pathA, null)).toBe(false);
  expect(matchesPrivateDocumentUploadPathContract(pathA, digestA.toUpperCase())).toBe(false);
});

test("REC-DOC-118 · legacy v4 originals recover, unexpected UUID versions fail closed", () => {
  const path = "uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/";
  const legacy = path + "12345678-1234-4abc-8abc-123456789abc.pdf";
  expect(matchesPrivateDocumentUploadPathContract(legacy, null)).toBe(true);
  expect(matchesPrivateDocumentUploadPathContract(legacy, "0".repeat(64))).toBe(true);
  expect(matchesPrivateDocumentUploadPathContract(path + "12345678-1234-3abc-8abc-123456789abc.pdf", null)).toBe(false);
  expect(matchesPrivateDocumentUploadPathContract(path + "12345678-1234-5abc-8abc-123456789abc.pdf", null)).toBe(false);
  expect(matchesPrivateDocumentUploadPathContract(path + "12345678-1234-4abc-7abc-123456789abc.pdf", null)).toBe(false);
  expect(matchesPrivateDocumentUploadPathContract(path + "../bad.pdf", null)).toBe(false);
});

test("REC-DOC-119 · gateway checks the private path contract before reading private Storage", () => {
  const source = readFileSync(
    join(process.cwd(), "supabase/functions/financial-app-db-gateway/document-logic.ts"),
    "utf8",
  );
  const finalize = source.indexOf('if (action === "document.upload_finalize")');
  const pathCheck = source.indexOf("matchesPrivateDocumentUploadPathContract(path, expectedSha256)", finalize);
  const download = source.indexOf(".download(path)", finalize);
  const register = source.indexOf("financial_app.register_document(", finalize);
  expect(pathCheck).toBeGreaterThan(finalize);
  expect(download).toBeGreaterThan(pathCheck);
  expect(register).toBeGreaterThan(download);
});
