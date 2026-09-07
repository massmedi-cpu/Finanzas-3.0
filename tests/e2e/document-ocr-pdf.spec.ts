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
  expect(result.warnings).not.toContain("pdf_page_requires_visual_ocr:1");
  expect(result.pages[0].lines.some((line) => line.words.some((word) => word.box.x > 0.55))).toBe(true);
  expect(result.principles.financialWrites).toBe(false);
});

test("F11 native PDF extraction flags image-only PDF pages instead of inventing text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "PDF engine smoke test runs once per CI matrix");
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 700, height: 900 });
  await page.setContent(`
    <!doctype html>
    <html><body style="margin:0;background:#fff;"><div style="width:700px;height:900px;background:#fff;"></div></body></html>
  `);
  const blankPng = await page.screenshot({ type: "png" });
  const dataUrl = `data:image/png;base64,${Buffer.from(blankPng).toString("base64")}`;
  await page.setContent(`<html><body style="margin:0"><img src="${dataUrl}" style="width:700px;height:900px" /></body></html>`);
  const imageOnlyPdf = await page.pdf({ format: "A4", printBackground: true });

  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(imageOnlyPdf),
    mimeType: "application/pdf",
    originalFileName: "scan.pdf",
    provider: new PdfTextOcrProvider(),
    now: () => new Date("2026-09-07T07:00:00Z"),
  });

  expect(result.status).toBe("empty");
  expect(result.warnings).toContain("pdf_page_requires_visual_ocr:1");
  expect(result.warnings).toContain("no_text_detected");
  expect(result.plainText).toBe("");
});
