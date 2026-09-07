import { expect, test } from "@playwright/test";

const validId = "93000000-0000-4000-8000-000000000093";

test("F11 OCR API rejects malformed ids before touching persistence", async ({ request }) => {
  const response = await request.get("/api/documents/ocr?id=not-a-uuid");
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: "ocr_failed", code: "invalid_ocr_document_id" });
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("F11 OCR API rejects undeclared query controls instead of accepting hidden behavior", async ({ request }) => {
  const response = await request.get(`/api/documents/ocr?id=${validId}&apply=true`);
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: "ocr_failed", code: "invalid_ocr_query" });
});
