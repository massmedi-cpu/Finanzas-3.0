import { expect, test } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { PdfTextOcrProvider } from "../../src/infrastructure/ocr/pdf-text-provider";

const documentId = "93000000-0000-4000-8000-000000000093";

test("F11 native PDF extraction reads real text and preserves right-column geometry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "PDF engine smoke test runs once per CI matrix");
  test.setTimeout(120_000);

  await page.setContent(`
    <!doctype html>
    <html lang="es">
      <body style="margin:0;font-family:Arial,sans-serif;color:#000;background:#fff;">
        <main style="width:700px;padding:56px;box-sizing:border-box;">
          <h1 style="text-align:center;font-size:34px;">FACTURA TEST</h1>
          <div style="font-size:24px;margin-top:48px;">
            <div style="display:flex;justify-content:space-between;"><span>SERVICIO</span><span>45,00 EUR</span></div>
            <div style="display:flex;justify-content:space-between;margin-top:22px;"><span>IVA</span><span>9,45 EUR</span></div>
            <div style="display:flex;justify-content:space-between;margin-top:32px;font-weight:700;"><span>TOTAL</span><span>54,45 EUR</span></div>
          </div>
        </main>
      </body>
    </html>
  `);

  const pdf = await page.pdf({ format: "A4", printBackground: true });
  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(pdf),
    mimeType: "application/pdf",
    originalFileName: "factura-test.pdf",
    provider: new PdfTextOcrProvider(),
    now: () => new Date("2026-09-07T07:00:00Z"),
  });

  expect(result.source).toBe("pdf_text");
  expect(result.extractor).toBe("pdfjs-6.2.108-native-text");
  expect(result.plainText.toUpperCase()).toContain("FACTURA TEST");
  expect(result.plainText.toUpperCase()).toContain("TOTAL");
  expect(result.plainText).toContain("54,45 EUR");
  expect(result.warnings).toHaveLength(0);
  expect(result.pages[0].lines.some((line) => line.words.some((word) => word.box.x > 0.55))).toBe(true);
  expect(result.principles.financialWrites).toBe(false);
});

test("F11 scanned PDF fallback rasterizes the page and recovers receipt text with Tesseract", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "PDF OCR smoke test runs once per CI matrix");
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 760, height: 980 });
  await page.setContent(`
    <!doctype html>
    <html lang="es">
      <body style="margin:0;background:#fff;color:#000;font-family:Arial,sans-serif;">
        <main style="width:700px;padding:54px;box-sizing:border-box;background:#fff;">
          <h1 style="font-size:40px;text-align:center;margin:0 0 44px;">TIENDA ESCANEADA</h1>
          <div style="font-size:32px;line-height:1.75;">
            <div style="display:flex;justify-content:space-between;"><span>PRODUCTO UNO</span><span>45,00 EUR</span></div>
            <div style="display:flex;justify-content:space-between;"><span>IVA</span><span>9,45 EUR</span></div>
            <div style="border-top:3px solid #000;margin-top:30px;padding-top:24px;display:flex;justify-content:space-between;font-weight:700;"><span>TOTAL</span><span>54,45 EUR</span></div>
          </div>
        </main>
      </body>
    </html>
  `);
  const receiptPng = await page.locator("main").screenshot({ type: "png" });
  const dataUrl = `data:image/png;base64,${Buffer.from(receiptPng).toString("base64")}`;

  await page.setContent(`
    <!doctype html>
    <html><body style="margin:0;background:#fff;">
      <img src="${dataUrl}" style="display:block;width:700px;height:auto" />
    </body></html>
  `);
  const scannedPdf = await page.pdf({ format: "A4", printBackground: true });

  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(scannedPdf),
    mimeType: "application/pdf",
    originalFileName: "ticket-escaneado.pdf",
    provider: new PdfTextOcrProvider(),
    now: () => new Date("2026-09-07T07:05:00Z"),
  });

  expect(result.source).toBe("pdf_ocr");
  expect(result.extractor).toBe("pdfjs-6.2.108+tesseract-js-7.0.0-spa");
  expect(result.status).not.toBe("empty");
  expect(result.plainText.toUpperCase()).toContain("TOTAL");
  expect(result.plainText).toContain("54,45");
  expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(3);
  expect(result.pages[0].lines.some((line) => line.words.some((word) => word.box.x > 0.55))).toBe(true);
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
});


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
