import { expect, test } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { TesseractImageOcrProvider } from "../../src/infrastructure/ocr/tesseract-image-provider";

const documentId = "93000000-0000-4000-8000-000000000093";

test("F11 real image OCR reads a high-contrast receipt and preserves geometry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "OCR engine smoke test runs once per CI matrix");
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 720, height: 900 });
  await page.setContent(`
    <!doctype html>
    <html lang="es">
      <body style="margin:0;background:#fff;color:#000;font-family:Arial,sans-serif;">
        <main style="width:640px;padding:42px;box-sizing:border-box;background:#fff;">
          <h1 style="font-size:42px;text-align:center;margin:0 0 38px;">SUPERMERCADO TEST</h1>
          <div style="font-size:34px;line-height:1.7;">
            <div style="display:flex;justify-content:space-between;"><span>LECHE</span><span>1,50 EUR</span></div>
            <div style="display:flex;justify-content:space-between;"><span>PAN</span><span>0,85 EUR</span></div>
            <div style="border-top:3px solid #000;margin-top:28px;padding-top:24px;display:flex;justify-content:space-between;font-weight:700;"><span>TOTAL</span><span>2,35 EUR</span></div>
          </div>
        </main>
      </body>
    </html>
  `);
  const receipt = await page.locator("main").screenshot({ type: "png" });

  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(receipt),
    mimeType: "image/png",
    originalFileName: "ticket-generado.png",
    provider: new TesseractImageOcrProvider(),
    now: () => new Date("2026-09-07T06:45:00Z"),
  });

  expect(result.source).toBe("image_ocr");
  expect(result.extractor).toBe("tesseract-js-7.0.0-spa");
  expect(result.plainText.length).toBeGreaterThan(25);
  expect(result.plainText.toUpperCase()).toContain("TOTAL");
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(3);
  expect(result.pages[0].lines.some((line) => line.words.some((word) => word.box.x > 0.55))).toBe(true);
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
});
