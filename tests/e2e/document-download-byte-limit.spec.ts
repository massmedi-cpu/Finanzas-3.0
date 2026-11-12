import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { knownPublicErrorCode } from "../../src/infrastructure/http/gateway-public-error";
import { documentDownloadContentDisposition } from "../../src/application/document-download-content-disposition";
import { verifiedDocumentOriginalOpenUrl } from "../../src/application/document-original-open-url";
import { SUPABASE_ORIGIN } from "../../src/infrastructure/auth/supabase-auth";
import {
  LimitedResponseBodyError,
  readLimitedResponseBody,
} from "../../src/infrastructure/http/limited-response-body";

// All fixtures are synthetic: no real provider, signed URL or original.
test("REC-DOC-MEM-001 · exact permitted payload streams with no Content-Length", async () => {
  const original = new Uint8Array([37, 80, 68, 70, 45, 1, 2, 3, 4, 5]);
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(original.slice(0, 3));
      controller.enqueue(original.slice(3, 7));
      controller.enqueue(original.slice(7));
      controller.close();
    },
  }));
  const result = await readLimitedResponseBody(response, original.byteLength);
  expect([...result]).toEqual([...original]);
  expect(result.buffer).toBeInstanceOf(ArrayBuffer);
});

test("REC-DOC-MEM-002 · body larger than declared size is cancelled at the real limit", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      controller.enqueue(new Uint8Array([5, 6, 7]));
    },
    cancel() { cancelled = true; },
  }), { headers: { "content-length": "2" } });
  await expect(readLimitedResponseBody(response, 6))
    .rejects.toMatchObject({ reason: "too_large" });
  expect(cancelled).toBe(true);
});

test("REC-DOC-MEM-003 · broken stream fails closed without returning partial original", async () => {
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) { controller.error(new Error("synthetic network failure")); },
  }));
  await expect(readLimitedResponseBody(response, 16))
    .rejects.toMatchObject({ reason: "read_failed" });
});

test("REC-DOC-MEM-004 · missing body never becomes a valid document", async () => {
  await expect(readLimitedResponseBody(new Response(null), 16))
    .rejects.toMatchObject({ reason: "unavailable" } satisfies Partial<LimitedResponseBodyError>);
});

test("REC-DOC-MEM-005 · all original downloads enforce shared byte limit", () => {
  const drive = readFileSync(join(process.cwd(),
    "src/infrastructure/google/google-drive-document-downloader.ts"), "utf8");
  const privateRoute = readFileSync(join(process.cwd(),
    "app/api/documents/download/route.ts"), "utf8");
  const ocrRoute = readFileSync(join(process.cwd(),
    "app/api/documents/ocr/route.ts"), "utf8");
  expect(drive).toContain("readLimitedResponseBody(response, GOOGLE_DRIVE_OCR_MAX_BYTES)");
  expect(privateRoute).toContain("readLimitedResponseBody(response, MAX_FILE_BYTES)");
  expect(ocrRoute).toContain("readLimitedResponseBody(response, MAX_BYTES)");
  for (const source of [drive, privateRoute, ocrRoute]) {
    expect(source).not.toContain("await response.arrayBuffer()");
  }
});

test("REC-DOC-MEM-006 · OCR source with missing Content-Length cannot allocate an unbounded body", async () => {
  let cancelCount = 0;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([37, 80, 68, 70]));
      controller.enqueue(new Uint8Array(64));
      controller.enqueue(new Uint8Array(64));
    },
    cancel() { cancelCount += 1; },
  }));
  await expect(readLimitedResponseBody(response, 80))
    .rejects.toMatchObject({ reason: "too_large" });
  expect(cancelCount).toBe(1);
});

test("REC-DOC-MEM-007 · OCR stream exactly at cap is accepted; truncated stream is rejected", async () => {
  const valid = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([37, 80, 68, 70]));
      controller.enqueue(new Uint8Array([1, 2]));
      controller.close();
    },
  }));
  expect([...await readLimitedResponseBody(valid, 6)]).toEqual([37, 80, 68, 70, 1, 2]);
  const broken = new Response(new ReadableStream<Uint8Array>({
    pull(controller) { controller.error(new Error("truncated upstream")); },
  }));
  await expect(readLimitedResponseBody(broken, 6))
    .rejects.toMatchObject({ reason: "read_failed" });
});

test("REC-DOC-DOWNLOAD-008 · duplicate private document IDs are rejected before any remote fetch", async ({ request }) => {
  const first = "93000000-0000-4000-8000-000000000117";
  const second = "93000000-0000-4000-8000-000000000118";
  for (const params of [
    `id=${first}&id=${second}`,
    `id=${first}&id=${first}`,
  ]) {
    const response = await request.get(`/api/documents/download?${params}`);
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "document_download_failed",
      code: "invalid_document_id",
    });
  }
});

test("REC-DOC-NET-009 · signed original and OCR fetches have cancellation deadlines", () => {
  const original = readFileSync(join(process.cwd(),
    "app/api/documents/download/route.ts"), "utf8");
  const ocr = readFileSync(join(process.cwd(),
    "app/api/documents/ocr/route.ts"), "utf8");
  expect(original).toContain("signal: AbortSignal.timeout(DOCUMENT_SOURCE_FETCH_TIMEOUT_MS)");
  expect(ocr).toContain("signal: AbortSignal.timeout(OCR_SOURCE_FETCH_TIMEOUT_MS)");
  expect(original).toContain("readLimitedResponseBody(response, MAX_FILE_BYTES)");
  expect(ocr).toContain("readLimitedResponseBody(response, MAX_BYTES)");
});


test("REC-DOC-SEC-011 · los códigos de descarga no aceptan propiedades heredadas de Object", () => {
  const statuses = {
    invalid_document_id: 400,
    document_download_failed: 503,
  };
  expect(knownPublicErrorCode(new Error("invalid_document_id"), statuses)).toBe("invalid_document_id");
  expect(knownPublicErrorCode(new Error("document_download_failed"), statuses)).toBe("document_download_failed");
  for (const malformed of [
    new Error("toString"),
    new Error("constructor"),
    new Error("__proto__"),
    new Error("invalid_document_id; IBAN ES7620770024003102575766"),
  ]) expect(knownPublicErrorCode(malformed, statuses)).toBeNull();
  const route = readFileSync(join(process.cwd(), "app/api/documents/download/route.ts"), "utf8");
  expect(route).toContain("knownPublicErrorCode(error, statuses)");
  expect(route).not.toContain("statuses[error.message]");
});


test("REC-DOC-DOWNLOAD-242 · Unicode/emoji and apostrophes remain downloadable with ASCII header fallback", () => {
  for (const name of [
    "Factura año 2026 - café.pdf",
    "Factura 🧾 tienda.pdf",
    "O'Brien & familia (diciembre).pdf",
    "archivo 50% de ahorro.pdf",
    "Factura\u0000\r\nmaliciosa.pdf",
  ]) {
    const disposition = documentDownloadContentDisposition(name);
    const response = new Response(null, { headers: {
      "content-disposition": disposition,
      "content-type": "application/pdf",
    } });
    const header = response.headers.get("content-disposition")!;
    expect(header).toMatch(/^attachment; filename="[\x20-\x7E]+"; filename\*=UTF-8''/);
    const unicode = header.split("filename*=UTF-8''")[1];
    expect(unicode).not.toContain("'");
    expect(unicode).not.toContain("\r");
    expect(unicode).not.toContain("\n");
    expect(decodeURIComponent(unicode)).toBe(
      name.replace(/[\u0000-\u001F\u007F-\u009F"\\/]/g, "_").trim(),
    );
  }
});

test("REC-DOC-DOWNLOAD-243 · empty and malformed Unicode names never create invalid HTTP headers", () => {
  expect(documentDownloadContentDisposition("")).toContain('filename="documento"');
  for (const source of [
    "\uD800unpaired", "unpaired\uDC00", "a".repeat(250) + "🧾",
    "\t\n", 'inv\\"oice.pdf',
  ]) {
    const disposition = documentDownloadContentDisposition(source);
    expect(() => new Response(null, {
      headers: { "content-disposition": disposition },
    })).not.toThrow();
    const filename = disposition.split("filename*=UTF-8''")[1];
    expect(() => decodeURIComponent(filename)).not.toThrow();
    expect(Array.from(decodeURIComponent(filename)).length).toBeLessThanOrEqual(180);
  }
});

test("REC-DOC-DOWNLOAD-244 · original-download route uses reviewed safe disposition builder", () => {
  const route = readFileSync(join(process.cwd(), "app/api/documents/download/route.ts"), "utf8");
  expect(route).toContain('import { documentDownloadContentDisposition }');
  expect(route).toContain('"content-disposition": documentDownloadContentDisposition(fileName)');
  expect(route).not.toContain("safeDownloadName");
});

// REC-DOC-OPEN-249–250: synthetic URLs only. No private original or gateway call.
test("REC-DOC-OPEN-249 · OCR and download validate signed gateway URLs before reading bytes", () => {
  for (const filename of [
    "app/api/documents/ocr/route.ts",
    "app/api/documents/download/route.ts",
  ]) {
    const route = readFileSync(join(process.cwd(), filename), "utf8");
    expect(route).toContain('callPersistenceGateway<DocumentOpen>("document.open"');
    expect(route).toContain("verifiedDocumentOriginalOpenUrl(opened, {");
    expect(route).toContain("storageProvider: detail.document.storageProvider");
    expect(route).toContain("sourceDriveFileId: detail.document.sourceDriveFileId");
  }
});

test("REC-DOC-OPEN-250 · signed source rejects foreign buckets, extra tokens and redirects", () => {
  const source = { storageProvider: "supabase" as const, sourceDriveFileId: null };
  const valid = SUPABASE_ORIGIN
    + "/storage/v1/object/sign/financial-app-documents/uploads/"
    + "97000000-0000-4000-8000-000000000097/"
    + "98000000-0000-4000-8000-000000000097.pdf?token=synthetic";
  expect(verifiedDocumentOriginalOpenUrl({ provider: "supabase", url: valid }, source)).toBe(valid);
  for (const invalid of [
    valid.replace("financial-app-documents", "other-bucket"),
    valid.replace("/storage/v1/object/sign/", "/storage/v1/object/public/"),
    valid.replace("/uploads/", "/other/"),
    valid.replace("97000000-0000-4000-8000-000000000097", "not-a-workspace"),
    valid + "&token=another",
    valid + "&redirect=https%3A%2F%2Foutside.invalid",
    valid + "#fragment",
    valid.replace(SUPABASE_ORIGIN, "https://outside.invalid"),
    valid.replace("?token=synthetic", ""),
  ]) {
    expect(() => verifiedDocumentOriginalOpenUrl({ provider: "supabase", url: invalid }, source),
      invalid).toThrow("document_open_unsafe_url");
  }
  expect(() => verifiedDocumentOriginalOpenUrl(
    { provider: "google_drive", url: valid }, source,
  )).toThrow("document_open_unsafe_url");
});
