import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("CR008-OCR-002 keeps the staged OCR runtime bounded and timeout-safe", async () => {
  const route = await readFile(path.join(process.cwd(), "app/api/documents/ocr/route.ts"), "utf8");
  const tesseract = await readFile(path.join(process.cwd(), "src/infrastructure/ocr/tesseract-image-provider.ts"), "utf8");
  const padded = await readFile(path.join(process.cwd(), "src/infrastructure/ocr/receipt-padded-cell-consensus-provider.ts"), "utf8");
  const illumination = await readFile(path.join(process.cwd(), "src/infrastructure/ocr/receipt-illumination.ts"), "utf8");

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
  expect(tesseract).toContain("await terminateOwnedWorker(worker);");
  expect(tesseract).toContain('error.kind === "queue"');

  expect(padded).toContain("class PaddedCellTimeoutError extends Error");
  expect(padded).toContain("let pipelineTail: Promise<void> = Promise.resolve();");
  expect(padded).toContain("return exclusivePipeline(async () => {");
  expect(padded.match(/if \(error instanceof PaddedCellTimeoutError\) throw error;/g)).toHaveLength(2);
  expect(padded).toContain("await terminateOwnedWorker(worker);");
  expect(padded).toContain('error.code === "ocr_padded_cell_queue_timeout"');
  expect(padded).not.toContain("Promise.all(([0, 1] as const)");
  expect(padded).toContain("await normalizeReceiptIllumination(bytes, glyphHeight, 0)");
  expect(padded).toContain("await normalizeReceiptIllumination(bytes, glyphHeight, 1)");

  expect(illumination).not.toContain("Buffer.alloc(data.length)");
  expect(illumination).toContain("data[index] = data[index] < background[index] * 0.78 ? 0 : 255;");
});
