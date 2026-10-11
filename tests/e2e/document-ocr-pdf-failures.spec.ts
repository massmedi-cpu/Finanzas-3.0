import { expect, test } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { PdfTextOcrProvider } from "../../src/infrastructure/ocr/pdf-text-provider";

const documentId = "93000000-0000-4000-8000-000000000093";

test("REC-OCR-045 · página escaneada fallida conserva las demás páginas nativas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "PDF.js recovery regression runs once");
  test.setTimeout(120_000);
  const raster = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("missing_canvas_context");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 720, 480);
    context.fillStyle = "#000";
    context.font = "bold 46px Arial";
    context.fillText("PAGINA ESCANEADA DOS", 34, 140);
    context.fillText("TOTAL 54,45", 34, 250);
    return canvas.toDataURL("image/png");
  });
  const native = (number: number) => [
    "<h1>FACTURA NATIVA PAGINA " + number + "</h1>",
    "<p>Factura con emisor identificado, fecha exacta, periodo facturado y número de referencia verificable.</p>",
    "<p>Descripción detallada de los servicios prestados con precio, desglose e importe mostrado íntegramente.</p>",
    "<p>SUBTOTAL 45,00 EUR · IVA 9,45 EUR · TOTAL 54,45 EUR.</p>",
  ].join("");
  await page.setContent([
    '<!doctype html><html><head><style>',
    '@page { size:A4; margin:0 }',
    'html,body { margin:0; padding:0; font-family:Arial,sans-serif }',
    '.sheet { width:210mm; height:297mm; box-sizing:border-box; padding:18mm; break-after:page; page-break-after:always; overflow:hidden }',
    '.sheet:last-child { break-after:auto; page-break-after:auto }',
    'h1 { font-size:25px } p { font-size:19px; line-height:1.4 } img { max-width:100%; display:block }',
    '</style></head><body>',
    '<section class="sheet">' + native(1) + '</section>',
    '<section class="sheet"><img src="' + raster + '" /></section>',
    '<section class="sheet">' + native(3) + '</section>',
    '</body></html>',
  ].join(""));
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  let attempted = 0;
  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(pdf),
    mimeType: "application/pdf",
    originalFileName: "tres-paginas-una-no-legible.pdf",
    provider: new PdfTextOcrProvider({
      async extract() {
        attempted += 1;
        throw new Error("synthetic_scanned_page_unavailable");
      },
    }),
    now: () => new Date("2026-10-11T09:00:00Z"),
  });
  expect(attempted).toBe(1);
  expect(result.pages).toHaveLength(3);
  expect(result.pages.map((item) => item.pageNumber)).toEqual([1, 2, 3]);
  expect(result.pages[0].plainText).toContain("FACTURA NATIVA PAGINA 1");
  expect(result.pages[1].plainText).toBe("");
  expect(result.pages[2].plainText).toContain("FACTURA NATIVA PAGINA 3");
  expect(result.plainText).toContain("FACTURA NATIVA PAGINA 1");
  expect(result.plainText).toContain("FACTURA NATIVA PAGINA 3");
  expect(result.warnings).toContain("pdf_page_visual_ocr_failed:2");
  expect(result.status).toBe("needs_review");
  expect(result.principles.requiresHumanReview).toBe(true);
  expect(result.principles.financialWrites).toBe(false);
});

test("REC-OCR-046 · PDF con solo imagen y motor fallido no inventa contenido", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "One PDF failure-path probe");
  const raster = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 450;
    canvas.height = 240;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("missing_canvas_context");
    context.fillStyle = "white";
    context.fillRect(0, 0, 450, 240);
    context.fillStyle = "black";
    context.font = "bold 33px Arial";
    context.fillText("TOTAL 32,10 EUR", 30, 120);
    return canvas.toDataURL("image/png");
  });
  await page.setContent('<html><body style="margin:0"><img src="' + raster + '"></body></html>');
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(pdf),
    mimeType: "application/pdf",
    originalFileName: "solo-imagen.pdf",
    provider: new PdfTextOcrProvider({
      async extract() { throw new Error("ocr_worker_unavailable"); },
    }),
  });
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].plainText).toBe("");
  expect(result.plainText).toBe("");
  expect(result.status).toBe("empty");
  expect(result.warnings).toContain("pdf_page_visual_ocr_failed:1");
  expect(result.warnings).toContain("no_text_detected");
  expect(result.principles.financialWrites).toBe(false);
});
