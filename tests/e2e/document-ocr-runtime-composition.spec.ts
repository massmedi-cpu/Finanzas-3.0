import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("CR008-OCR-002 v18 keeps the serverless OCR runtime flat with preview diagnostics inline", async () => {
  const route = await readFile(path.join(process.cwd(), "app/api/documents/ocr/route.ts"), "utf8");
  const tesseract = await readFile(path.join(process.cwd(), "src/infrastructure/ocr/tesseract-image-provider.ts"), "utf8");

  expect(route).toContain("export const maxDuration = 300;");
  expect(route).toContain("new ReceiptPaddedCellConsensusImageOcrProvider(");
  expect(route).toContain("new ReceiptAnchorFilteringImageOcrProvider(");
  expect(route).toContain(
    "new PreviewAnchorSignalDiagnosticProvider(new TesseractImageOcrProvider())",
  );
  expect(route).not.toContain("new ReceiptPaddedCellConsensusImageOcrProvider();");
  expect(route).not.toContain("new ReceiptFocusedCellConsensusImageOcrProvider");
  expect(route).not.toContain("new ReceiptRowCellConsensusImageOcrProvider");
  expect(tesseract.match(/if \(error instanceof OcrTimeoutError\) throw error;/g)).toHaveLength(2);
  expect(tesseract).toContain("if (timedOut) {");
  expect(tesseract).toContain("invalidateWorker();");
});
