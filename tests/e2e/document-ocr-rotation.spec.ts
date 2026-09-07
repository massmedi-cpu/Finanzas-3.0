import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { TesseractImageOcrProvider } from "../../src/infrastructure/ocr/tesseract-image-provider";

const documentId = "93000000-0000-4000-8000-000000000093";

function desktopOcrOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "chromium-desktop", "OCR engine orientation probe runs once per CI matrix");
  test.setTimeout(120_000);
}

async function renderSidewaysReceipt(page: Page) {
  await page.setViewportSize({ width: 1000, height: 800 });
  const dataUrl = await page.evaluate(() => {
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
    source.fillText("TIENDA ORIENTACION", 320, 60);

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

    const sideways = document.createElement("canvas");
    sideways.width = upright.height;
    sideways.height = upright.width;
    const output = sideways.getContext("2d");
    if (!output) throw new Error("output_canvas_unavailable");
    output.fillStyle = "#fff";
    output.fillRect(0, 0, sideways.width, sideways.height);
    output.translate(sideways.width, 0);
    output.rotate(Math.PI / 2);
    output.drawImage(upright, 0, 0);
    return sideways.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",", 2)[1], "base64");
}

test("F11 OCR reads a receipt rotated 90 degrees without corrupting layout geometry", async ({ page }, testInfo) => {
  desktopOcrOnly(testInfo);
  const image = await renderSidewaysReceipt(page);

  const result = await runDocumentOcr({
    documentId,
    bytes: new Uint8Array(image),
    mimeType: "image/png",
    originalFileName: "ticket-girado-90.png",
    provider: new TesseractImageOcrProvider(),
    now: () => new Date("2026-09-07T07:30:00Z"),
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
