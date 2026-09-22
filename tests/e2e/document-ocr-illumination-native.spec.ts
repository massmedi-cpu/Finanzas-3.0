import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { runDocumentOcr, type DocumentOcrProvider } from "../../src/application/document-ocr-service";
import type { OcrWord } from "../../src/domain/document-ocr";
import { ReceiptPaddedCellConsensusImageOcrProvider } from "../../src/infrastructure/ocr/receipt-padded-cell-consensus-provider";

test("native recovery reads printed decimals through shadows and keeps the large total's leading digits", async () => {
  test.setTimeout(60_000);
  const width = 1500, height = 1350;
  const word = (text: string, x: number, baseline: number, boxWidth: number, size = 42): OcrWord => ({
    text, confidence: /\d/.test(text) ? 0.3 : 0.92,
    box: { x: x / width, y: (baseline - size) / height, width: boxWidth / width, height: size / height },
  });
  const rows = [
    ["CAFE MOLIDO", "1", "1.35", "1.35"],
    ["PAN INTEGRAL", "2", "2.47", "4.94"],
    ["ARROZ", "1", "3.60", "3.60"],
  ];
  const positions = [100, 790, 940, 1170];
  const words = [word("DESCRIPCION", 100, 250, 440), word("UDS", 790, 250, 90),
    word("PRECIO", 940, 250, 180), word("IMPORTE", 1170, 250, 210),
    ...rows.flatMap((row, index) => row.map((value, column) => word(
      column >= 2 ? (index === 1 && column === 2 ? "9.47" : value.replace(".", "")) : value,
      positions[column], 410 + index * 110, column === 0 ? 430 : column === 1 ? 28 : 120,
    ))),
    word("Base", 820, 850, 120), word("849", 1180, 850, 120),
    word("IVA", 850, 930, 90), word("085", 1180, 930, 120),
    word("Total", 710, 1100, 210, 70),
  ];
  const text = (x: number, y: number, value: string, size = 42) => `<text x="${x}" y="${y}" font-size="${size}">${value}</text>`;
  // Deliberately unrelated amounts: recovery must read pixels, never reconcile a sum.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="paper"><stop stop-color="#aaa"/><stop offset=".48" stop-color="#eee"/><stop offset=".7" stop-color="#b5b5b5"/><stop offset="1" stop-color="#ddd"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#paper)"/>
    <g font-family="DejaVu Sans Mono" fill="#181818">
      ${["DESCRIPCION", "UDS", "PRECIO", "IMPORTE"].map((v, i) => text(positions[i], 250, v)).join("")}
      ${rows.map((row, i) => row.map((v, j) => text(positions[j], 410 + i * 110, v)).join("")).join("")}
      ${text(820, 850, "Base:")}${text(1180, 850, "8.49")}
      ${text(850, 930, "IVA:")}${text(1180, 930, "0.85")}
      ${text(710, 1100, "Total:", 70)}${text(1050, 1100, "12.34", 70)}
    </g></svg>`;
  const bytes = await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
  const base: DocumentOcrProvider = { supports: () => true, extract: async () => ({
    source: "image_ocr", extractor: "geometry-fixture", pages: [{ pageNumber: 1, words }],
  }) };
  const result = await runDocumentOcr({ documentId: "99000000-0000-4000-8000-000000000100", bytes,
    mimeType: "image/jpeg", originalFileName: "shadowed-decimals.jpg",
    provider: new ReceiptPaddedCellConsensusImageOcrProvider(base) });
  for (const [label, expected] of [["CAFE", "1,35"], ["PAN", "4,94"], ["ARROZ", "3,60"],
    ["Base", "8,49"], ["IVA", "0,85"], ["Total", "12,34"]]) {
    expect(result.pages[0].lines.find((line) => line.text.includes(label))?.text).toContain(expected);
  }
  expect(result.plainText).not.toContain("9.47");
  const total = result.pages[0].lines.flatMap((line) => line.words).find((word) => word.text === "12,34")!;
  expect(total.box.x).toBeGreaterThan(0.68);
  expect(total.box.width).toBeLessThan(0.18);
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
});
