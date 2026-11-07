import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readLimitedJsonRequest } from "../../src/infrastructure/http/limited-json-request";

const docsPath = join(process.cwd(), "app/api/documents/route.ts");
const reviewPath = join(process.cwd(), "app/api/documents/ocr-review/route.ts");

test("REC-DOC-MEM-011 · both document metadata mutations use the bounded streaming parser", () => {
  const source = readFileSync(docsPath, "utf8");
  const review = readFileSync(reviewPath, "utf8");
  expect(source).toContain("const MAX_DOCUMENT_JSON_BYTES = 512 * 1024");
  expect(source.match(/readLimitedJsonRequest\(request, MAX_DOCUMENT_JSON_BYTES\)/g)).toHaveLength(2);
  expect(source).not.toContain("request.json()");
  expect(review).toContain("const MAX_REVIEW_JSON_BYTES = 256 * 1024");
  expect(review).toContain("readLimitedJsonRequest(request, MAX_REVIEW_JSON_BYTES)");
  expect(review).not.toContain("request.json()");
});

test("REC-DOC-MEM-012 · the complete valid 200-file Drive metadata batch fits the cap", async () => {
  const files = Array.from({ length: 200 }, (_, index) => ({
    type: "other",
    name: "f".repeat(500),
    mimeType: "application/pdf",
    fileId: String(index).padStart(300, "0"),
    sizeBytes: 15728640,
  }));
  const body = JSON.stringify({ action: "drive_batch", files });
  const byteSize = new TextEncoder().encode(body).byteLength;
  expect(byteSize).toBeLessThanOrEqual(512 * 1024);
  const parsed = await readLimitedJsonRequest(
    new Request("https://financial.example/api/documents", { method: "POST", body }),
    512 * 1024,
  );
  expect(parsed).toMatchObject({ action: "drive_batch", files: expect.arrayContaining([
    expect.objectContaining({ mimeType: "application/pdf" }),
  ]) });
});

test("REC-DOC-MEM-013 · excessive private document JSON POST/PATCH requests fail HTTP 413", async ({ request }) => {
  for (const method of ["post", "patch"] as const) {
    const response = await request[method]("/api/documents", {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ action: "metadata", notes: "x".repeat(524289) }),
    });
    expect(response.status(), method).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request", code: "document_body_too_large",
    });
  }
});

test("REC-DOC-MEM-014 · invalid document request JSON is rejected before any gateway call", async ({ request }) => {
  const response = await request.post("/api/documents", {
    headers: { "content-type": "application/json" },
    data: '{"action":',
  });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ error: "invalid_request", code: "invalid_document_body" });
});
