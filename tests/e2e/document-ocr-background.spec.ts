import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { TesseractImageOcrProvider } from "../../src/infrastructure/ocr/tesseract-image-provider";

function desktopOcrOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "chromium-desktop", "OCR camera-background probe runs once per CI matrix");
  test.setTimeout(120_000);
}

async function renderReceiptOnTextBackground(page: Page) {
  await page.setViewportSize({ width: 1200, height: 1500 });
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_context_unavailable");

    // Simulate a photographed surface containing readable text that is not part of the receipt.
    ctx.fillStyle = "#b8b19f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#302e2a";
    ctx.font = "700 42px Arial";
    ctx.textAlign = "left";
    ctx.fillText("FONDO AJENO", 35, 115);
    ctx.fillText("NO ES TICKET", 760, 270);
    ctx.fillText("PUBLICIDAD MESA", 45, 1370);

    // Receipt paper, deliberately leaving substantial visible background around it.
    const x = 210;
    const y = 230;
    const w = 780;
    const h = 1050;
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 7;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "#faf9f3";
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = "transparent";

    ctx.fillStyle = "#151515";
    ctx.textBaseline = "top";
    ctx.font = "700 46px Arial";
    ctx.textAlign = "center";
    ctx.fillText("SUPERMERCADO CAMARA", x + w / 2, y + 75);

    ctx.font = "36px Arial";
    ctx.textAlign = "left";
    ctx.fillText("LECHE", x + 70, y + 300);
    ctx.fillText("PAN", x + 70, y + 405);
    ctx.fillText("FRUTA", x + 70, y + 510);
    ctx.textAlign = "right";
    ctx.fillText("1,50 EUR", x + w - 70, y + 300);
    ctx.fillText("0,85 EUR", x + w - 70, y + 405);
    ctx.fillText("2,10 EUR", x + w - 70, y + 510);

    ctx.strokeStyle = "#151515";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 70, y + 680);
    ctx.lineTo(x + w - 70, y + 680);
    ctx.stroke();
    ctx.font = "700 42px Arial";
    ctx.textAlign = "left";
    ctx.fillText("TOTAL", x + 70, y + 735);
    ctx.textAlign = "right";
    ctx.fillText("4,45 EUR", x + w - 70, y + 735);

    return canvas.toDataURL("image/jpeg", 0.86);
  });
  return Buffer.from(dataUrl.split(",", 2)[1], "base64");
}

test("F11 camera OCR keeps readable background text out of the receipt result", async ({ page }, testInfo) => {
  desktopOcrOnly(testInfo);
  const image = await renderReceiptOnTextBackground(page);

  const result = await runDocumentOcr({
    documentId: "96000000-0000-4000-8000-000000000096",
    bytes: new Uint8Array(image),
    mimeType: "image/jpeg",
    originalFileName: "ticket-foto-con-fondo.jpg",
    provider: new TesseractImageOcrProvider(),
    now: () => new Date("2026-09-07T08:20:00Z"),
  });

  const text = result.plainText.toUpperCase();
  expect(text).toContain("TOTAL");
  expect(text).toMatch(/4[,.]45/);
  expect(text).not.toContain("FONDO AJENO");
  expect(text).not.toContain("NO ES TICKET");
  expect(text).not.toContain("PUBLICIDAD MESA");
  expect(result.pages[0].lines.some((line) => line.words.some((word) => /4[,.]45/.test(word.text) && word.box.x > 0.55))).toBe(true);
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
});
