import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const documentsClient = read("app/documents/documents-client.tsx");
const ocrRoute = read("app/api/documents/ocr/route.ts");
const tesseract = read("src/infrastructure/ocr/tesseract-image-provider.ts");
const illumination = read("src/infrastructure/ocr/receipt-illumination.ts");
const paddedConsensus = read("src/infrastructure/ocr/receipt-padded-cell-consensus-provider.ts");
const reviewWorkbench = read("app/documents/ocr-page-review-workbench.tsx");
const ocrConfig = read("playwright.ocr.config.ts");

test("PRE-038 §110 converges camera, gallery/files and Drive into the document OCR surface", () => {
  expect(documentsClient).toContain('id="document-camera"');
  expect(documentsClient).toContain('capture="environment"');
  expect(documentsClient).toContain('id="document-file"');
  expect(documentsClient).toContain('.pdf,.jpg,.jpeg,.png,.webp');

  expect(ocrRoute).toContain("GoogleDriveDocumentDownloader");
  expect(ocrRoute).toContain('storageProvider: "supabase" | "google_drive"');
  expect(ocrRoute).toContain("const imageProvider = new ReceiptPaddedCellConsensusImageOcrProvider(");
  expect(ocrRoute).toContain("const pdfProvider = new PdfTextOcrProvider()");
  expect(ocrRoute).toContain("runDocumentOcr");
});

test("PRE-038 §111 has conservative rotation, framing, illumination and perspective evaluation", () => {
  expect(tesseract).toContain("rotateAuto: true");
  expect(tesseract).toContain("needsOrientationFallback");
  expect(tesseract).toContain("refineBackgroundContamination");
  expect(tesseract).toContain("refinementIsSafe");
  expect(tesseract).toContain("MAX_PIXELS");

  expect(illumination).toContain("assessReceiptImageQuality");
  expect(illumination).toContain("needsPerspectiveCorrection");
  expect(illumination).toContain('.removeAlpha().grayscale().raw()');
  expect(illumination).toContain(".blur(");
  expect(illumination).toContain(".median(");
  expect(illumination).toContain("data[index] < background[index] * 0.78");

  expect(paddedConsensus).toContain("sharp.kernel.lanczos3");
  expect(paddedConsensus).toContain("normalizeReceiptIllumination(bytes, glyphHeight, 0)");
  expect(paddedConsensus).toContain("normalizeReceiptIllumination(bytes, glyphHeight, 1)");
  expect(paddedConsensus).toContain("choosePaddedNumericConsensus");
  expect(ocrConfig).toContain("document-ocr-image-quality");
});

test("PRE-038 §115 keeps a visual reconstruction workbench backed by OCR geometry", () => {
  expect(reviewWorkbench).toMatch(/box\.(x|y|width|height)/);
  expect(reviewWorkbench).toMatch(/layoutText|plainText/);
});

test("PRE-038 §116 keeps the dedicated OCR regression pack and native illumination case", () => {
  expect(ocrConfig).toContain("document-ocr-illumination-native");
  expect(ocrConfig).toContain("document-ocr-row-geometry");
  expect(ocrConfig).toContain("document-ocr-columns-native");
  expect(ocrConfig).toContain("document-ocr-cell-recovery");
  expect(ocrConfig).toContain("document-ocr-financial-interpretation");
});

test("PRE-038 §117 keeps OCR review-only and associations explicit", () => {
  expect(documentsClient).toContain("El OCR sólo se ejecutará si lo solicitas");
  expect(documentsClient).toContain('method: "suggested"');
  expect(documentsClient).toContain('method: "manual"');
  expect(documentsClient).not.toContain('method: "automatic"');
});

test("PRE-038 §111 perspective/keystone evaluation is explicit before G5", () => {
  const preprocessingSurface = `${tesseract}\n${illumination}\n${paddedConsensus}`;
  expect(preprocessingSurface).toMatch(/perspective|keystone|projective|homography/i);
  expect(illumination).toContain("perspectiveFromDarkExtents");
  expect(illumination).toContain("perspectiveConfidence");
});

test.fixme("PRE-038 §116 must name every heterogeneous physical/source fixture before G5", () => {
  const regressionSurface = `${ocrConfig}\n${read("tests/e2e/document-ocr-illumination-native.spec.ts")}`;
  for (const expected of ["thermal", "wrinkled", "perspective", "screenshot", "camera", "gallery", "drive"]) {
    expect(regressionSurface.toLowerCase()).toContain(expected);
  }
});
