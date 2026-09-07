import { expect, test } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { PdfTextOcrProvider } from "../../src/infrastructure/ocr/pdf-text-provider";

const documentId = "99000000-0000-4000-8000-000000000099";

test("F11 scanned multipage PDF OCR reaches every raster page without losing the final page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Multipage PDF OCR probe runs once per CI matrix");
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 820, height: 1000 });
  const images = await page.evaluate(() => {
    return Array.from({ length: 4 }, (_, index) => {
      const pageNumber = index + 1;
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 900;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas_context_unavailable");
      ctx.fillStyle = "#faf9f3";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#171717";
      ctx.textBaseline = "top";
      ctx.font = "700 40px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`FACTURA ESCANEADA ${pageNumber}`, 360, 70);
      ctx.font = "32px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`PAGINA ${pageNumber}`, 65, 230);
      ctx.fillText(`CONCEPTO ${pageNumber}A`, 65, 340);
      ctx.fillText(`CONCEPTO ${pageNumber}B`, 65, 440);
      ctx.textAlign = "right";
      ctx.fillText(`${pageNumber}1,10 EUR`, 655, 340);
      ctx.fillText(`${pageNumber}2,20 EUR`, 655, 440);
      ctx.strokeStyle = "#171717";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(65, 590);
      ctx.lineTo(655, 590);
      ctx.stroke();
      ctx.font = "700 37px Arial";
      ctx.textAlign = "left";
      ctx.fillText("TOTAL PAGINA", 65, 630);
      ctx.textAlign = "right";
      ctx.fillText(`${pageNumber}3,30 EUR`, 655, 630);
      return canvas.toDataURL("image/png");
    });
  });

  await page.setContent(`
    <!doctype html>
    <html><head><style>
      @page{size:A4;margin:0}
      html,body{margin:0;padding:0;background:#fff}
      .sheet{width:210mm;height:297mm;display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;padding-top:12mm;break-after:page;page-break-after:always;overflow:hidden}
      .sheet:last-child{break-after:auto;page-break-after:auto}
      img{display:block;width:178mm;height:auto}
    </style></head><body>
      ${images.map((src) => `<section class="sheet"><img src="${src}" /></section>`).join("")}
    </body></html>
  `);

  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(pdf),
    mimeType: "application/pdf",
    originalFileName: "factura-escaneada-4-paginas.pdf",
    provider: new PdfTextOcrProvider(),
    now: () => new Date("2026-09-07T08:30:00Z"),
  });

  expect(result.source).toBe("pdf_ocr");
  expect(result.pages).toHaveLength(4);
  for (let pageNumber = 1; pageNumber <= 4; pageNumber += 1) {
    const current = result.pages.find((entry) => entry.pageNumber === pageNumber);
    expect(current).toBeDefined();
    expect(current!.plainText.toUpperCase()).toContain(`PAGINA ${pageNumber}`);
    expect(current!.plainText.toUpperCase()).toContain("TOTAL PAGINA");
    expect(current!.plainText).toMatch(new RegExp(`${pageNumber}3[,.]30`));
    expect(current!.lines.some((line) => line.words.some((word) => word.box.x > 0.55))).toBe(true);
  }
  expect(result.plainText.toUpperCase()).toContain("FACTURA ESCANEADA 1");
  expect(result.plainText.toUpperCase()).toContain("FACTURA ESCANEADA 4");
  expect(result.warnings).not.toContain("incomplete_page_coverage");
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
});
