import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const documentsClient = read("app/documents/documents-client.tsx");
const ocrRoute = read("app/api/documents/ocr/route.ts");
const tesseract = read("src/infrastructure/ocr/tesseract-image-provider.ts");
const rotationDecision = read("src/infrastructure/ocr/ocr-rotation-decision.ts");
const illumination = read("src/infrastructure/ocr/receipt-illumination.ts");
const paddedConsensus = read("src/infrastructure/ocr/receipt-padded-cell-consensus-provider.ts");
const reviewWorkbench = read("app/documents/ocr-page-review-workbench.tsx");
const ocrConfig = read("playwright.ocr.config.ts");
const heterogeneousMatrix = read("tests/e2e/document-ocr-heterogeneous-matrix.spec.ts");
const ocrContract = read("tests/e2e/document-ocr-contract.spec.ts");

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
  expect(tesseract).toContain("ocrNeedsRotationFallback(initial.words, metadata)");
  expect(rotationDecision).toContain("financialCue");
  expect(rotationDecision).toContain("confidence >= 0.78");
  expect(rotationDecision).toContain("imageColor: autoRotate");
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
  expect(ocrConfig).toContain("image-quality|heterogeneous-matrix");
});

test("PRE-038 §115 keeps a visual reconstruction workbench backed by OCR geometry", () => {
  expect(reviewWorkbench).toContain("preservesGeometry");
  expect(reviewWorkbench).toContain("page.layoutText");
  expect(reviewWorkbench).toContain("page.plainText");
  expect(reviewWorkbench).toContain("Abrir original");
  expect(ocrContract).toContain("F11 OCR contract reconstructs skewed receipt rows while preserving columns");
});

test("PRE-038 §116 keeps the dedicated OCR regression pack and native illumination case", () => {
  for (const suite of [
    "heterogeneous-matrix",
    "illumination-native",
    "row-geometry",
    "columns-native",
    "cell-recovery",
    "financial-interpretation",
  ]) {
    expect(ocrConfig).toContain(suite);
  }
});

test("PRE-038 §117 keeps OCR review-only and associations explicit", () => {
  expect(documentsClient).toContain("El OCR sólo se ejecutará si lo solicitas");
  expect(documentsClient).toContain('method: "manual" | "suggested"');
  expect(documentsClient).toContain('associate(transactionId: string, method: "manual" | "suggested")');
  expect(documentsClient).toContain("Sugerencia confirmada explícitamente");
  expect(documentsClient).not.toContain('method: "automatic"');
});

test("PRE-038 §111 perspective/keystone evaluation is explicit before G5", () => {
  const preprocessingSurface = `${tesseract}\n${illumination}\n${paddedConsensus}`;
  expect(preprocessingSurface).toMatch(/perspective|keystone|projective|homography/i);
  expect(illumination).toContain("perspectiveFromDarkExtents");
  expect(illumination).toContain("perspectiveConfidence");
});

test("PRE-038 §116 covers heterogeneous physical fixtures plus Camera, Gallery, Drive, PDF and invoice semantics", () => {
  const physical = heterogeneousMatrix.toLowerCase();
  for (const expected of [
    "good-regular-photo",
    "thermal-small-receipt",
    "wrinkled-long-receipt",
    "bad-light-tilted-camera",
    "perspective-photo",
    "screenshot-gallery",
  ]) {
    expect(physical).toContain(expected);
  }

  expect(documentsClient).toContain('id="document-camera"');
  expect(documentsClient).toContain('id="document-file"');
  expect(ocrRoute).toContain("GoogleDriveDocumentDownloader");
  expect(ocrRoute).toContain('storageProvider: "supabase" | "google_drive"');
  expect(ocrRoute).toContain("new PdfTextOcrProvider()");
  expect(ocrContract).toContain('word("FACTURA"');
});
