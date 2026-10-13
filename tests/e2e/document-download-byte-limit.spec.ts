import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
