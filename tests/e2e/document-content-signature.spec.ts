import { expect, test } from "@playwright/test";
import { documentBytesMatchMimeType } from "../../src/domain/document-content-signature";

const bytes = (...values: number[]) => Uint8Array.from(values);

test("PRE-006 recognizes the four supported document signatures", () => {
  expect(documentBytesMatchMimeType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31), "application/pdf")).toBe(true);
  expect(documentBytesMatchMimeType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00), "image/jpeg")).toBe(true);
  expect(documentBytesMatchMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00), "image/png")).toBe(true);
  expect(documentBytesMatchMimeType(bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50), "image/webp")).toBe(true);
});

test("PRE-006 rejects MIME spoofing, truncation and unsupported types", () => {
  const fakePdf = new TextEncoder().encode("MZ executable-like bytes");
  expect(documentBytesMatchMimeType(fakePdf, "application/pdf")).toBe(false);
  expect(documentBytesMatchMimeType(bytes(0x25, 0x50, 0x44), "application/pdf")).toBe(false);
  expect(documentBytesMatchMimeType(bytes(0x89, 0x50, 0x4e, 0x47), "image/png")).toBe(false);
  expect(documentBytesMatchMimeType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x4e, 0x4f, 0x50, 0x45), "image/webp")).toBe(false);
  expect(documentBytesMatchMimeType(bytes(1, 2, 3, 4), "application/octet-stream")).toBe(false);
  expect(documentBytesMatchMimeType(new Uint8Array(), "image/jpeg")).toBe(false);
});
