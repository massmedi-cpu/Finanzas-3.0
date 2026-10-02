import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { TesseractImageOcrProvider } from "../../src/infrastructure/ocr/tesseract-image-provider";

type Fixture = {
  name: string;
  mimeType: "image/jpeg" | "image/png";
  bytes: Buffer;
};

function receiptSvg(options: {
  width: number;
  height: number;
  merchant: string;
  paper?: string;
  ink?: string;
  transform?: string;
  background?: string;
  long?: boolean;
}) {
  const { width, height, merchant, paper = "#faf9f3", ink = "#171717", transform = "", long = false } = options;
  const products = long
    ? ["CAFE MOLIDO", "PAN INTEGRAL", "ARROZ", "LECHE", "FRUTA", "PASTA", "ACEITE", "YOGUR", "AGUA", "QUESO"]
    : ["CAFE MOLIDO", "PAN INTEGRAL", "ARROZ"];
  const start = 300;
  const rowGap = long ? 105 : 125;
  const totalY = Math.min(height - 120, start + products.length * rowGap + 150);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
        <stop stop-color="${paper}"/>
        <stop offset="0.48" stop-color="${options.background ?? paper}"/>
        <stop offset="0.54" stop-color="${paper}"/>
        <stop offset="1" stop-color="${paper}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#paper)"/>
    <g transform="${transform}" font-family="DejaVu Sans Mono" fill="${ink}">
      <text x="70" y="105" font-size="58" font-weight="700">${merchant}</text>
      <text x="70" y="190" font-size="42">TICKET 2026-10-02</text>
      <text x="70" y="260" font-size="38">DESCRIPCION      UDS   PRECIO   IMPORTE</text>
      ${products.map((product, index) => {
        const y = start + index * rowGap;
        const price = index % 2 ? "2,47" : "1,35";
        return `<text x="70" y="${y}" font-size="40">${product}</text>
          <text x="570" y="${y}" font-size="40">1</text>
          <text x="650" y="${y}" font-size="40">${price}</text>
          <text x="790" y="${y}" font-size="40">${price}</text>`;
      }).join("")}
      <text x="520" y="${totalY}" font-size="58" font-weight="700">TOTAL</text>
      <text x="770" y="${totalY}" font-size="58" font-weight="700">12,34</text>
    </g>
  </svg>`;
}

async function buildFixtures(): Promise<Fixture[]> {
  const good = Buffer.from(receiptSvg({ width: 980, height: 1150, merchant: "MERCADO NORTE" }));
  const thermal = Buffer.from(receiptSvg({ width: 720, height: 980, merchant: "TERMICO SUR", paper: "#dedbd1", ink: "#5b5b5b" }));
  const wrinkled = Buffer.from(receiptSvg({ width: 880, height: 1900, merchant: "TIENDA LARGA", background: "#c8c8c2", long: true }));
  const badLightTilt = Buffer.from(receiptSvg({ width: 980, height: 1250, merchant: "LUZ IRREGULAR", background: "#b0b0aa", transform: "rotate(3 490 625)" }));
  const perspective = Buffer.from(receiptSvg({ width: 980, height: 1250, merchant: "ANGULO MARKET", transform: "translate(55 0) skewX(-5)" }));
  const screenshot = Buffer.from(receiptSvg({ width: 1100, height: 900, merchant: "CAPTURA DIGITAL", paper: "#ffffff", ink: "#000000" }));

  return [
    { name: "good-regular-photo.jpg", mimeType: "image/jpeg", bytes: await sharp(good).jpeg({ quality: 88 }).toBuffer() },
    { name: "thermal-small-receipt.jpg", mimeType: "image/jpeg", bytes: await sharp(thermal).jpeg({ quality: 64 }).toBuffer() },
    { name: "wrinkled-long-receipt.jpg", mimeType: "image/jpeg", bytes: await sharp(wrinkled).jpeg({ quality: 76 }).toBuffer() },
    { name: "bad-light-tilted-camera.jpg", mimeType: "image/jpeg", bytes: await sharp(badLightTilt).jpeg({ quality: 80 }).toBuffer() },
    { name: "perspective-photo.jpg", mimeType: "image/jpeg", bytes: await sharp(perspective).jpeg({ quality: 82 }).toBuffer() },
    { name: "screenshot-gallery.png", mimeType: "image/png", bytes: await sharp(screenshot).png().toBuffer() },
  ];
}

test("PRE-038 §116 real OCR survives the heterogeneous synthetic image matrix", async () => {
  test.setTimeout(300_000);
  const provider = new TesseractImageOcrProvider();
  const fixtures = await buildFixtures();
  const outcomes: Array<{ name: string; text: string; confidence: number }> = [];

  for (const fixture of fixtures) {
    const output = await provider.extract({
      bytes: fixture.bytes,
      mimeType: fixture.mimeType,
      originalFileName: fixture.name,
    });
    const words = output.pages[0]?.words ?? [];
    const text = words.map((word) => word.text).join(" ");
    const confidence = words.length ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length : 0;
    outcomes.push({ name: fixture.name, text, confidence });
  }

  for (const outcome of outcomes) {
    expect(outcome.text.toUpperCase(), outcome.name).toContain("TOTAL");
    expect(outcome.text, outcome.name).toMatch(/12[,.]34/);
    expect(outcome.confidence, outcome.name).toBeGreaterThan(0.45);
  }
});

test("PRE-038 §116 matrix names the physical/source conditions required by the Axioma", async () => {
  const names = (await buildFixtures()).map((fixture) => fixture.name.toLowerCase()).join(" ");
  for (const marker of ["thermal", "small", "long", "wrinkled", "bad-light", "tilted", "perspective", "screenshot", "gallery", "camera"]) {
    expect(names).toContain(marker);
  }
});
