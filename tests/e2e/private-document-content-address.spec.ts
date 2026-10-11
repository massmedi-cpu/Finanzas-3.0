import { expect, test } from "@playwright/test";
import { privateDocumentContentId } from "../../src/domain/private-document-content-address";
import { createHash } from "node:crypto";

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
