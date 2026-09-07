import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { runDocumentOcr } from "../../src/application/document-ocr-service";
import { TesseractImageOcrProvider } from "../../src/infrastructure/ocr/tesseract-image-provider";

function desktopOcrOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "chromium-desktop", "OCR camera stress probes run once per CI matrix");
  test.setTimeout(120_000);
}

async function ocr(bytes: Buffer, fileName: string, documentId: string) {
  return runDocumentOcr({
    documentId,
    bytes: new Uint8Array(bytes),
    mimeType: "image/jpeg",
    originalFileName: fileName,
    provider: new TesseractImageOcrProvider(),
    now: () => new Date("2026-09-07T08:25:00Z"),
  });
}

async function renderPerspectivePhoto(page: Page) {
  await page.setViewportSize({ width: 1200, height: 1500 });
  await page.setContent(`
    <!doctype html>
    <html lang="es">
      <head>
        <style>
          html,body{margin:0;width:1200px;height:1500px;overflow:hidden;background:#9c9587;font-family:Arial,sans-serif}
          body{display:grid;place-items:center}
          .paper{
            position:relative;width:760px;height:1030px;box-sizing:border-box;padding:70px 62px;background:#f7f4ea;color:#26231f;
            box-shadow:18px 26px 34px rgba(0,0,0,.28);
            transform:perspective(1500px) rotateX(3deg) rotateY(-4deg) rotateZ(3deg);
            transform-origin:center center;
          }
          .light{position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,rgba(0,0,0,.11),transparent 38%,rgba(255,255,255,.13) 69%,rgba(0,0,0,.06));mix-blend-mode:multiply}
          h1{font-size:42px;text-align:center;margin:0 0 74px;font-weight:700}
          .row,.total{display:flex;justify-content:space-between;font-size:34px;line-height:1.65}
          .total{border-top:3px solid #26231f;margin-top:58px;padding-top:35px;font-size:39px;font-weight:700}
        </style>
      </head>
      <body>
        <main class="paper">
          <h1>TIENDA PERSPECTIVA</h1>
          <div class="row"><span>LECHE ENTERA</span><span>1,50 EUR</span></div>
          <div class="row"><span>PAN ARTESANO</span><span>0,85 EUR</span></div>
          <div class="row"><span>FRUTA VARIADA</span><span>2,10 EUR</span></div>
          <div class="row"><span>CAFE MOLIDO</span><span>2,00 EUR</span></div>
          <div class="total"><span>TOTAL</span><span>6,45 EUR</span></div>
          <div class="light"></div>
        </main>
      </body>
    </html>
  `);
  return page.locator("body").screenshot({ type: "jpeg", quality: 76 });
}

async function renderLongReceipt(page: Page) {
  await page.setViewportSize({ width: 900, height: 700 });
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 5900;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_context_unavailable");
    ctx.fillStyle = "#f8f6ee";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#242424";
    ctx.textBaseline = "top";
    ctx.font = "700 40px Arial";
    ctx.textAlign = "center";
    ctx.fillText("HIPERMERCADO TICKET LARGO", 360, 65);
    ctx.font = "29px Arial";
    for (let index = 1; index <= 38; index += 1) {
      const y = 230 + (index - 1) * 132;
      ctx.textAlign = "left";
      ctx.fillText(`ARTICULO ${String(index).padStart(2, "0")}`, 55, y);
      ctx.textAlign = "right";
      const euros = 1 + (index % 8);
      const cents = (index * 7) % 100;
      ctx.fillText(`${euros},${String(cents).padStart(2, "0")} EUR`, 665, y);
    }
    const totalY = 5365;
    ctx.strokeStyle = "#242424";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(55, totalY - 45);
    ctx.lineTo(665, totalY - 45);
    ctx.stroke();
    ctx.font = "700 36px Arial";
    ctx.textAlign = "left";
    ctx.fillText("TOTAL", 55, totalY);
    ctx.textAlign = "right";
    ctx.fillText("186,73 EUR", 665, totalY);
    return canvas.toDataURL("image/jpeg", 0.79);
  });
  return Buffer.from(dataUrl.split(",", 2)[1], "base64");
}

test("F11 camera OCR survives moderate perspective, tilt and uneven illumination", async ({ page }, testInfo) => {
  desktopOcrOnly(testInfo);
  const image = await renderPerspectivePhoto(page);
  const result = await ocr(image, "ticket-perspectiva-luz.jpg", "97000000-0000-4000-8000-000000000097");
  const text = result.plainText.toUpperCase();
  expect(text).toContain("TOTAL");
  expect(text).toMatch(/6[,.]45/);
  expect(text).toContain("LECHE");
  expect(text).toContain("CAFE");
  expect(result.pages[0].lines.some((line) => line.words.some((word) => /6[,.]45/.test(word.text) && word.box.x > 0.5))).toBe(true);
  expect(result.principles.financialWrites).toBe(false);
});

test("F11 OCR reads a long narrow receipt through the final total without truncating the lower rows", async ({ page }, testInfo) => {
  desktopOcrOnly(testInfo);
  const image = await renderLongReceipt(page);
  const result = await ocr(image, "ticket-largo-38-lineas.jpg", "98000000-0000-4000-8000-000000000098");
  const text = result.plainText.toUpperCase();
  expect(text).toContain("ARTICULO 01");
  expect(text).toContain("ARTICULO 38");
  expect(text).toContain("TOTAL");
  expect(text).toMatch(/186[,.]73/);
  expect(result.pages[0].lines.length).toBeGreaterThanOrEqual(35);
  const total = result.pages[0].lines.flatMap((line) => line.words).find((word) => word.text.toUpperCase() === "TOTAL");
  expect(total).toBeDefined();
  expect(total!.box.y).toBeGreaterThan(0.85);
  expect(result.principles.financialWrites).toBe(false);
});
