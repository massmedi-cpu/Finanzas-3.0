import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import type { OcrWord } from "../../src/domain/document-ocr";
import { ReceiptAnchorFilteringImageOcrProvider } from "../../src/infrastructure/ocr/receipt-anchor-filter-provider";
import { ReceiptPaddedCellConsensusImageOcrProvider } from "../../src/infrastructure/ocr/receipt-padded-cell-consensus-provider";
import { preserveAlignedNumericColumns, TesseractImageOcrProvider } from "../../src/infrastructure/ocr/tesseract-image-provider";

const word = (text: string, x: number, y: number, width = 0.06): OcrWord => ({
  text, confidence: 0.9, box: { x, y, width, height: 0.02 },
});

test("isolation preserves aligned numeric evidence but not an adjacent text sheet", () => {
  const selected = [0.2, 0.3, 0.4, 0.5].map((y) => word("DESCRIPTION", 0.1, y, 0.45));
  const amounts = [word("IMPORTE", 0.7, 0.1), ...["1,80", "2,80", "560", "17,50"].map((value, i) => word(value, 0.7, 0.2 + i * 0.1))];
  const background = ["PLATO", "MENU", "POSTRE", "BEBIDA"].map((label, i) => word(label, 0.9, 0.2 + i * 0.1));
  const result = preserveAlignedNumericColumns(selected, [...selected, ...amounts, ...background]);
  expect(result).toEqual([...selected, ...amounts]);
  expect(result).toContain(amounts[3]); // Original object/geometry, including unresolved "560".
  expect(result.map((value) => value.text)).not.toContain("5,60");
});

test("isolation does not join detached numbers that do not share document rows", () => {
  const selected = [0.2, 0.3, 0.4].map((y) => word("DESCRIPTION", 0.1, y, 0.45));
  const outside = [0.65, 0.75, 0.85].map((y) => word("8,50", 0.7, y));
  expect(preserveAlignedNumericColumns(selected, [...selected, ...outside])).toEqual(selected);
});

test("isolation requires distinct rows, not several numbers on one background line", () => {
  const selected = [0.2, 0.3, 0.4].map((y) => word("DESCRIPTION", 0.1, y, 0.45));
  const outside = [0.7, 0.77, 0.84].map((x) => word("8,50", x, 0.2));
  expect(preserveAlignedNumericColumns(selected, [...selected, ...outside])).toEqual(selected);
});

test("isolation protects a numeric column without a header, with separate currency tokens", () => {
  const selected = [0.2, 0.3, 0.4].map((y) => word("DESCRIPTION", 0.1, y, 0.45));
  const outside = [0.2, 0.3, 0.4].flatMap((y) => [word("8,50", 0.7, y), word("EUR", 0.77, y)]);
  const all = [...selected, ...outside];
  expect(preserveAlignedNumericColumns(selected, all)).toEqual(all);
});

async function renderWideReceipt(background = false) {
  const text = (x: number, y: number, value: string) => `<text x="${x}" y="${y}">${value}</text>`;
  const rows = [
    ["ENERGY", "1", "1,80", "1,80"],
    ["TERCIO GALICIA CERO", "1", "2,80", "2,80"],
    ["CANA GRANDE", "2", "2,80", "5,60"],
    ["CUBATA", "1", "5,50", "5,50"],
    ["AGUA CON GAS", "1", "1,80", "1,80"],
  ];
  // The wide gap before IMPORTE triggered background isolation even though the first
  // Tesseract pass recognized every amount correctly. No browser or private photo needed.
  const width = background ? 2100 : 1600;
  const height = background ? 2600 : 1900;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="white"/>
    <g font-family="Arial" font-size="54" fill="black">
      ${text(120, 310, "DESCRIPCION")}${text(770, 310, "UDS")}
      ${text(970, 310, "PRECIO")}${text(1300, 310, "IMPORTE")}
      ${rows.map((row, i) => row.map((value, column) => text([120, 770, 950, 1300][column], 500 + i * 150, value)).join("")).join("")}
      ${text(1000, 1320, "BASE")}${text(1300, 1320, "15,91")}
      ${text(1000, 1430, "IVA")}${text(1300, 1430, "1,59")}
      ${text(1000, 1580, "TOTAL")}${text(1300, 1580, "17,50")}
      ${background ? ["MENU DIA", "PLATO", "POSTRE", "BEBIDA", "PROMO"].map((label, i) => text(1780, 500 + i * 150, label)).join("") : ""}
    </g>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

for (const { pipeline, background } of [
  { pipeline: "base", background: false },
  { pipeline: "runtime", background: false },
  { pipeline: "base", background: true },
  { pipeline: "runtime", background: true },
]) {
  test(`OCR ${pipeline} preserves the detached amount column and each summary value${background ? " beside background text" : ""}`, async () => {
    test.setTimeout(90_000);
    const base = new TesseractImageOcrProvider();
    const provider = pipeline === "base"
      ? base
      : new ReceiptPaddedCellConsensusImageOcrProvider(new ReceiptAnchorFilteringImageOcrProvider(base));
    const result = await runDocumentOcr({
      documentId: "99000000-0000-4000-8000-000000000100",
      bytes: await renderWideReceipt(background),
      mimeType: "image/png",
      originalFileName: "wide-columns-regression.png",
      provider,
    });

    const lines = result.pages[0].lines;
    const amountWords = lines.flatMap((line) => line.words).filter((word) => word.box.x > 1290 / (background ? 2100 : 1600));
    expect(amountWords.map((word) => word.text)).toEqual(expect.arrayContaining([
      "IMPORTE", "1,80", "2,80", "5,60", "5,50", "15,91", "1,59", "17,50",
    ]));
    for (const [label, quantity, price, amount] of [
      ["ENERGY", "1", "1,80", "1,80"],
      ["GALICIA", "1", "2,80", "2,80"],
      ["GRANDE", "2", "2,80", "5,60"],
      ["CUBATA", "1", "5,50", "5,50"],
      ["GAS", "1", "1,80", "1,80"],
    ]) {
      const line = lines.find((line) => line.words.some((word) => word.text.includes(label)));
      expect(line?.words.slice(-3).map((word) => word.text)).toEqual([quantity, price, amount]);
    }
    for (const [label, amount] of [["BASE", "15,91"], ["IVA", "1,59"], ["TOTAL", "17,50"]]) {
      const line = lines.find((line) => line.words.some((word) => word.text === label));
      expect(line?.words.map((word) => word.text)).toContain(amount);
    }
    if (background) {
      expect(result.warnings).toContain("background_text_filtered");
      for (const label of ["MENU", "PLATO", "POSTRE", "BEBIDA", "PROMO"]) {
        expect(result.plainText).not.toContain(label);
      }
    } else {
      expect(result.warnings).not.toContain("background_text_filtered");
    }
    expect(result.principles.financialWrites).toBe(false);
    expect(result.principles.requiresHumanReview).toBe(true);
  });
}
