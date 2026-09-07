import { expect, test } from "@playwright/test";

const isProtectedPreview = Boolean(process.env.VERCEL_PREVIEW_URL);
const documentId = "93000000-0000-4000-8000-000000000094";

test("protected preview reads the synthetic Drive receipt end to end without financial writes", async ({ request }, testInfo) => {
  test.skip(!isProtectedPreview, "requires protected preview checkpoint");
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
  expect(result.plainText.toUpperCase()).toContain("TOTAL");
  expect(result.plainText).toContain("19,00");
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(4);
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
  expect(result.principles.preservesGeometry).toBe(true);
});
