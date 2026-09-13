import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("CR008-OCR-002 v11 keeps the serverless OCR runtime flat", async () => {
  const route = await readFile(path.join(process.cwd(), "app/api/documents/ocr/route.ts"), "utf8");

  expect(route).toContain(
    "new ReceiptAnchorFilteringImageOcrProvider(new TesseractImageOcrProvider())",
  );
  expect(route).toContain("new ReceiptPaddedCellConsensusImageOcrProvider(");
  expect(route).not.toContain("new ReceiptPaddedCellConsensusImageOcrProvider();");
  expect(route).not.toContain("new ReceiptFocusedCellConsensusImageOcrProvider");
  expect(route).not.toContain("new ReceiptRowCellConsensusImageOcrProvider");
});
