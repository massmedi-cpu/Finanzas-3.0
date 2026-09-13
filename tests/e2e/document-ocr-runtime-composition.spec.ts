import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("CR008-OCR-002 v10 keeps the serverless OCR runtime flat", async () => {
  const route = await readFile(path.join(process.cwd(), "app/api/documents/ocr/route.ts"), "utf8");

  expect(route).toContain(
    "new ReceiptPaddedCellConsensusImageOcrProvider(new TesseractImageOcrProvider())",
  );
  expect(route).not.toContain("new ReceiptPaddedCellConsensusImageOcrProvider();");
});
