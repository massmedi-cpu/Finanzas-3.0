import { expect, test } from "@playwright/test";
import {
  LimitedJsonRequestError,
  readLimitedJsonRequest,
} from "../../src/infrastructure/http/limited-json-request";

const endpoint = "https://financial.example/api/documents/ocr-review";

function streamedRequest(body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request(endpoint, {
    method: "PATCH",
    body,
    headers: { "content-type": "application/json", ...headers },
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("REC-OCR-MEM-001 · valid JSON at exact declared body cap is consumed faithfully", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ issuerName: "Sevilla", totalCents: 12345 }));
  const request = new Request(endpoint, {
    method: "PATCH",
    headers: { "content-type": "application/json", "content-length": String(bytes.byteLength) },
    body: bytes,
  });
  await expect(readLimitedJsonRequest(request, bytes.byteLength))
    .resolves.toEqual({ issuerName: "Sevilla", totalCents: 12345 });
});

test("REC-OCR-MEM-002 · content-length omissions cannot bypass streaming cap", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"amount":'));
      controller.enqueue(new Uint8Array(64));
    },
    cancel() { cancelled = true; },
  });
  await expect(readLimitedJsonRequest(streamedRequest(stream), 16))
    .rejects.toMatchObject({ reason: "too_large" } satisfies Partial<LimitedJsonRequestError>);
  expect(cancelled).toBe(true);
});

test("REC-OCR-MEM-003 · understated Content-Length cannot bypass actual byte cap", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ payload: "z".repeat(120) })));
      controller.close();
    },
  });
  await expect(readLimitedJsonRequest(streamedRequest(stream, { "content-length": "3" }), 64))
    .rejects.toMatchObject({ reason: "too_large" });
});

test("REC-OCR-MEM-004 · oversized declared body fails before reading private data", async () => {
  let pulled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull() { pulled = true; },
  });
  await expect(readLimitedJsonRequest(streamedRequest(stream, { "content-length": "4097" }), 4096))
    .rejects.toMatchObject({ reason: "too_large" });
  expect(pulled).toBe(false);
});

test("REC-OCR-MEM-005 · malformed or non-UTF8 input never produces a partial review", async () => {
  for (const bytes of [new TextEncoder().encode("{\"type\":"), new Uint8Array([0xff, 0xfe])]) {
    const request = new Request(endpoint, { method: "PATCH", body: bytes });
    await expect(readLimitedJsonRequest(request, 256))
      .rejects.toMatchObject({ reason: "invalid_json" });
  }
});

test("REC-OCR-MEM-006 · oversized review route returns HTTP 413 without gateway write", async ({ request }) => {
  const response = await request.patch("/api/documents/ocr-review", {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({
      documentId: "93000000-0000-4000-8000-000000000001",
      type: "invoice",
      notes: "n".repeat(262145),
    }),
  });
  expect(response.status()).toBe(413);
  await expect(response.json()).resolves.toEqual({
    error: "invalid_request", code: "document_review_too_large",
  });
});
