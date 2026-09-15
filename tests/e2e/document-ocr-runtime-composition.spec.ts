import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("CR008-OCR-002 v18 keeps the serverless OCR runtime flat with preview diagnostics inline", async () => {
  const route = await readFile(path.join(process.cwd(), "app/api/documents/ocr/route.ts"), "utf8");

  expect(route).toContain("new ReceiptPaddedCellConsensusImageOcrProvider(");
  expect(route).toContain("new ReceiptAnchorFilteringImageOcrProvider(");
  expect(route).toContain(
    "new PreviewAnchorSignalDiagnosticProvider(new TesseractImageOcrProvider())",
  );
  expect(route).not.toContain("new ReceiptPaddedCellConsensusImageOcrProvider();");
  expect(route).not.toContain("new ReceiptFocusedCellConsensusImageOcrProvider");
  expect(route).not.toContain("new ReceiptRowCellConsensusImageOcrProvider");
});
