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

async function renderReceiptBesidePrintedSheet(page: Page) {
  await page.setViewportSize({ width: 1300, height: 1600 });
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1300;
    canvas.height = 1600;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_context_unavailable");
    ctx.fillStyle = "#77736a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const x = 90;
    const y = 55;
    const w = 760;
    const h = 1485;
    ctx.fillStyle = "#f4f2ea";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#171717";
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.font = "700 42px 'Courier New', monospace";
    ctx.fillText("AVILA BAR - VICTORIA KENT", x + w / 2, y + 65);
    ctx.font = "29px 'Courier New', monospace";
    ctx.fillText("N.I.F.: YB398422C", x + w / 2, y + 135);
    ctx.fillText("TELEFONO: +34 641552438", x + w / 2, y + 185);

    ctx.textAlign = "left";
    ctx.fillText("DESCRIPCION", x + 45, y + 330);
    ctx.fillText("ENERGY", x + 45, y + 405);
    ctx.fillText("TERCIO GALICIA CERO", x + 45, y + 480);
    ctx.fillText("CANA GRANDE", x + 45, y + 555);
    ctx.fillText("CUBATA", x + 45, y + 630);
    ctx.fillText("AGUA CON GAS", x + 45, y + 705);
    ctx.textAlign = "right";
    ctx.fillText("UDS  PRECIO IMPORTE", x + w - 45, y + 330);
    ctx.fillText("1  1,80  1,80", x + w - 45, y + 405);
    ctx.fillText("1  2,80  2,80", x + w - 45, y + 480);
    ctx.fillText("2  2,80  5,60", x + w - 45, y + 555);
    ctx.fillText("1  5,50  5,50", x + w - 45, y + 630);
    ctx.fillText("1  1,80  1,80", x + w - 45, y + 705);
    ctx.font = "700 34px 'Courier New', monospace";
    ctx.fillText("Base: 15,91", x + w - 45, y + 840);
    ctx.fillText("Total IVA 1,59", x + w - 45, y + 905);
    ctx.font = "700 58px 'Courier New', monospace";
    ctx.fillText("Total: 17,50", x + w - 45, y + 990);
    ctx.textAlign = "center";
    ctx.font = "700 48px 'Courier New', monospace";
    ctx.fillText("PENDIENTE DE PAGO", x + w / 2, y + 1110);
    ctx.fillText("Mesa T29", x + w / 2, y + 1210);
    ctx.fillText("Terraza", x + w / 2, y + 1280);

    // A second printed sheet sits immediately beside the receipt. Its readable text must never
    // be reconstructed as part of the receipt, even though it has similar contrast and size.
    const bx = 900;
    ctx.fillStyle = "#f5f3e9";
    ctx.fillRect(bx, 80, 400, 1420);
    ctx.fillStyle = "#111";
    ctx.textAlign = "left";
    ctx.font = "700 40px Arial";
    const foreign = ["PLATO ARROZ", "MENU DIA", "PATA BRAVA", "BOOK NOW", "SHAWARMA", "POSTRE", "BEBIDA", "PROMO MESA"];
    foreign.forEach((label, index) => ctx.fillText(label, bx + 28, 190 + index * 150));

    return canvas.toDataURL("image/jpeg", 0.83);
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

test("CR008-OCR-002 isolates a photographed receipt from an adjacent printed sheet and keeps monetary rows", async ({ page }, testInfo) => {
  desktopOcrOnly(testInfo);
  const image = await renderReceiptBesidePrintedSheet(page);

  const result = await runDocumentOcr({
    documentId: "99000000-0000-4000-8000-000000000099",
    bytes: new Uint8Array(image),
    mimeType: "image/jpeg",
    originalFileName: "ticket-con-hoja-adyacente.jpg",
    provider: new TesseractImageOcrProvider(),
    now: () => new Date("2026-09-12T16:30:00Z"),
  });

  const text = result.plainText.toUpperCase();
  expect(text).toContain("AVILA BAR");
  expect(text).toContain("GALICIA");
  expect(text).toMatch(/15[,.]91/);
  expect(text).toMatch(/1[,.]59/);
  expect(text).toMatch(/17[,.]50/);
  expect(text).toMatch(/5[,.]60/);
  expect(text).not.toContain("PLATO ARROZ");
  expect(text).not.toContain("MENU DIA");
  expect(text).not.toContain("SHAWARMA");
  expect(result.warnings).toContain("background_text_filtered");
  expect(result.principles.financialWrites).toBe(false);
  expect(result.principles.requiresHumanReview).toBe(true);
});
