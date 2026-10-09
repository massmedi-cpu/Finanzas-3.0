import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const documentId = process.env.OCR_LIVE_FIXTURE_DOCUMENT_ID?.trim() ?? "";
const hasIsolatedFixture = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId);

test("protected preview reads an explicitly configured isolated Drive OCR fixture without financial writes", async ({ request }, testInfo) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");
  test.skip(!hasIsolatedFixture, "requires OCR_LIVE_FIXTURE_DOCUMENT_ID from an isolated non-production fixture");
  test.skip(testInfo.project.name !== "chromium-desktop", "live Drive OCR runs once per CI matrix");
  test.setTimeout(120_000);

  const response = await request.get(`/api/documents/ocr?id=${documentId}`);
  expect(response.status()).toBe(200);

  const result = await response.json();
  expect(result.documentId).toBe(documentId);
  expect(result.source).toBe("image_ocr");
  expect(result.extractor).toBe("tesseract-js-7.0.0-spa");
  expect(result.status).not.toBe("empty");
  expect(result.plainText.toUpperCase()).toContain("FINANCIAL APP TEST");
  expect(result.plainText.toUpperCase()).toContain("TICKET");
  expect(result.plainText.toUpperCase()).toContain("TOTAL");
  expect(result.plainText).toContain("19,00");
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(4);
  expect(result.pages[0].lines.some((line: { words: Array<{ box: { x: number } }> }) => line.words.some((word) => word.box.x > 0.55))).toBe(true);
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
  expect(result.principles.preservesGeometry).toBe(true);
});
