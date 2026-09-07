import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { TesseractImageOcrProvider } from "../../src/infrastructure/ocr/tesseract-image-provider";

function desktopOcrOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "chromium-desktop", "OCR EXIF probes run once per CI matrix");
  test.setTimeout(120_000);
}

function withExifOrientation(jpeg: Buffer, orientation: 6 | 8) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("jpeg_soi_missing");
  const app1 = Buffer.from([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
    orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

async function renderExifReceipt(page: Page, orientation: 6 | 8) {
  await page.setViewportSize({ width: 1000, height: 800 });
  const dataUrl = await page.evaluate((exifOrientation) => {
    const upright = document.createElement("canvas");
    upright.width = 640;
    upright.height = 900;
    const source = upright.getContext("2d");
    if (!source) throw new Error("source_canvas_unavailable");

    source.fillStyle = "#fff";
    source.fillRect(0, 0, upright.width, upright.height);
    source.fillStyle = "#111";
    source.textBaseline = "top";
    source.font = "700 40px Arial";
    source.textAlign = "center";
    source.fillText("TIENDA EXIF MOVIL", 320, 60);

    source.font = "32px Arial";
    source.textAlign = "left";
    source.fillText("ARTICULO UNO", 55, 230);
    source.fillText("ARTICULO DOS", 55, 330);
    source.fillText("ARTICULO TRES", 55, 430);
    source.textAlign = "right";
    source.fillText("2,10 EUR", 585, 230);
    source.fillText("3,20 EUR", 585, 330);
    source.fillText("4,30 EUR", 585, 430);

    source.strokeStyle = "#111";
    source.lineWidth = 3;
    source.beginPath();
    source.moveTo(55, 560);
    source.lineTo(585, 560);
    source.stroke();
    source.font = "700 38px Arial";
    source.textAlign = "left";
    source.fillText("TOTAL", 55, 610);
    source.textAlign = "right";
    source.fillText("9,60 EUR", 585, 610);

    const stored = document.createElement("canvas");
    stored.width = upright.height;
    stored.height = upright.width;
    const output = stored.getContext("2d");
    if (!output) throw new Error("output_canvas_unavailable");
    output.fillStyle = "#fff";
    output.fillRect(0, 0, stored.width, stored.height);
    if (exifOrientation === 6) {
      output.translate(0, stored.height);
      output.rotate(-Math.PI / 2);
    } else {
      output.translate(stored.width, 0);
      output.rotate(Math.PI / 2);
    }
    output.drawImage(upright, 0, 0);
    return stored.toDataURL("image/jpeg", 0.9);
  }, orientation);

  const raw = Buffer.from(dataUrl.split(",", 2)[1], "base64");
  return withExifOrientation(raw, orientation);
}

for (const orientation of [6, 8] as const) {
  test(`F11 OCR reads a mobile JPEG with EXIF orientation ${orientation} without corrupting receipt geometry`, async ({ page }, testInfo) => {
    desktopOcrOnly(testInfo);
    const image = await renderExifReceipt(page, orientation);
    const result = await runDocumentOcr({
      documentId: orientation === 6
        ? "94000000-0000-4000-8000-000000000094"
        : "95000000-0000-4000-8000-000000000095",
      bytes: new Uint8Array(image),
      mimeType: "image/jpeg",
      originalFileName: `ticket-movil-exif-${orientation}.jpg`,
      provider: new TesseractImageOcrProvider(),
      now: () => new Date("2026-09-07T08:00:00Z"),
    });

    expect(result.plainText.toUpperCase()).toContain("TOTAL");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(4);
    const totalWord = result.pages[0].lines.flatMap((line) => line.words).find((word) => word.text.toUpperCase() === "TOTAL");
    expect(totalWord).toBeDefined();
    expect(totalWord!.box.y).toBeGreaterThan(0.5);
    expect(result.pages[0].lines.some((line) => line.words.some((word) => /9[,.]60/.test(word.text) && word.box.x > 0.55))).toBe(true);
    expect(result.principles.financialWrites).toBe(false);
    expect(result.principles.requiresHumanReview).toBe(true);
  });
}
