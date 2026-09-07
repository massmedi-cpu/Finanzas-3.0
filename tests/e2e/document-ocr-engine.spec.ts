import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { TesseractImageOcrProvider } from "../../src/infrastructure/ocr/tesseract-image-provider";

const documentId = "93000000-0000-4000-8000-000000000093";

function desktopOcrOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "chromium-desktop", "OCR engine smoke tests run once per CI matrix");
  test.setTimeout(120_000);
}

async function renderReceipt(
  page: Page,
  options: {
    background: string;
    color: string;
    fontFamily: string;
    title: string;
    rows: Array<[string, string]>;
    total: string;
  },
) {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.setContent(`
    <!doctype html>
    <html lang="es">
      <body style="margin:0;background:${options.background};color:${options.color};font-family:${options.fontFamily};">
        <main style="width:640px;padding:42px;box-sizing:border-box;background:${options.background};">
          <h1 style="font-size:42px;text-align:center;margin:0 0 38px;">${options.title}</h1>
          <div style="font-size:34px;line-height:1.7;">
            ${options.rows.map(([label, amount]) => `<div style="display:flex;justify-content:space-between;"><span>${label}</span><span>${amount}</span></div>`).join("")}
            <div style="border-top:3px solid ${options.color};margin-top:28px;padding-top:24px;display:flex;justify-content:space-between;font-weight:700;"><span>TOTAL</span><span>${options.total}</span></div>
          </div>
        </main>
      </body>
    </html>
  `);
}

function assertReadOnlyOcr(result: Awaited<ReturnType<typeof runDocumentOcr>>) {
  expect(result.source).toBe("image_ocr");
  expect(result.extractor).toBe("tesseract-js-7.0.0-spa");
  expect(result.plainText.toUpperCase()).toContain("TOTAL");
  expect(result.pages).toHaveLength(1);
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
}

test("F11 real PNG OCR reads a high-contrast receipt and preserves geometry", async ({ page }, testInfo) => {
  desktopOcrOnly(testInfo);
  await renderReceipt(page, {
    background: "#fff",
    color: "#000",
    fontFamily: "Arial,sans-serif",
    title: "SUPERMERCADO TEST",
    rows: [["LECHE", "1,50 EUR"], ["PAN", "0,85 EUR"]],
    total: "2,35 EUR",
  });
  const receipt = await page.locator("main").screenshot({ type: "png" });

  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(receipt),
    mimeType: "image/png",
    originalFileName: "ticket-generado.png",
    provider: new TesseractImageOcrProvider(),
    now: () => new Date("2026-09-07T06:45:00Z"),
  });

  assertReadOnlyOcr(result);
  expect(result.plainText.length).toBeGreaterThan(25);
  expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(3);
  expect(result.pages[0].lines.some((line) => line.words.some((word) => word.box.x > 0.55))).toBe(true);
});

test("F11 real JPEG OCR survives lossy compression and lower contrast", async ({ page }, testInfo) => {
  desktopOcrOnly(testInfo);
  await renderReceipt(page, {
    background: "#f1eee6",
    color: "#444",
    fontFamily: "'Courier New',monospace",
    title: "CAFETERIA CENTRAL",
    rows: [["CAFE", "1,80 EUR"], ["TOSTADA", "2,20 EUR"]],
    total: "4,00 EUR",
  });
  const receipt = await page.locator("main").screenshot({ type: "jpeg", quality: 68 });

  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(receipt),
    mimeType: "image/jpeg",
    originalFileName: "ticket-foto-comprimida.jpg",
    provider: new TesseractImageOcrProvider(),
    now: () => new Date("2026-09-07T06:46:00Z"),
  });

  assertReadOnlyOcr(result);
  expect(result.plainText.length).toBeGreaterThan(20);
  expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(3);
});

test("F11 real WebP OCR reads a camera-compatible image format", async ({ page }, testInfo) => {
  desktopOcrOnly(testInfo);
  await page.setViewportSize({ width: 760, height: 900 });
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 820;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_context_unavailable");
    context.fillStyle = "#faf9f4";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#202020";
    context.textBaseline = "top";
    context.font = "700 42px Arial";
    context.textAlign = "center";
    context.fillText("FARMACIA DEMO", 360, 70);
    context.font = "34px Arial";
    context.textAlign = "left";
    context.fillText("PRODUCTO A", 70, 230);
    context.fillText("PRODUCTO B", 70, 320);
    context.textAlign = "right";
    context.fillText("6,25 EUR", 650, 230);
    context.fillText("3,75 EUR", 650, 320);
    context.strokeStyle = "#202020";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(70, 420);
    context.lineTo(650, 420);
    context.stroke();
    context.font = "700 38px Arial";
    context.textAlign = "left";
    context.fillText("TOTAL", 70, 460);
    context.textAlign = "right";
    context.fillText("10,00 EUR", 650, 460);
    return canvas.toDataURL("image/webp", 0.76);
  });
  expect(dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
  const receipt = Buffer.from(dataUrl.split(",", 2)[1], "base64");

  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(receipt),
    mimeType: "image/webp",
    originalFileName: "ticket-camara.webp",
    provider: new TesseractImageOcrProvider(),
    now: () => new Date("2026-09-07T06:47:00Z"),
  });

  assertReadOnlyOcr(result);
  expect(result.plainText.length).toBeGreaterThan(20);
  expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(3);
  expect(result.pages[0].lines.some((line) => line.words.some((word) => word.box.x > 0.55))).toBe(true);
});
