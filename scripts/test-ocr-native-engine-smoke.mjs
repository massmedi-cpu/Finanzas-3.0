// Offline Tesseract engine smoke: real raster pixels and bundled Spanish model.
// This is one controlled synthetic image, NOT accuracy certification on real bills.
import assert from "node:assert/strict";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker, PSM } from "tesseract.js";
import { pdfNativeTextNeedsVisualOcr } from "../src/infrastructure/ocr/pdf-native-coverage.ts";

const canvas = createCanvas(1000, 220);
const context = canvas.getContext("2d");
context.fillStyle = "#ffffff";
context.fillRect(0, 0, 1000, 220);
context.fillStyle = "#000000";
context.font = "bold 62px Arial";
context.fillText("TOTAL 23,45", 45, 145);
const png = canvas.toBuffer("image/png");
assert.ok(png.byteLength > 1000, "synthetic receipt image created");

// A scanned PDF contains pixels but NO native text. Embed the synthetic
// raster as a JPEG XObject, rasterize it again using PDF.js and send that
// resulting PNG through the same local Spanish Tesseract worker.
function embedRasterInPdf(jpeg, width, height, selectableStamp = false) {
  const imageCommands = "q\n" + width + " 0 0 " + height + " 0 0 cm\n/Im1 Do\nQ\n";
  const stampCommands = selectableStamp ? "BT\n/F1 8 Tf\n" + (width - 25) + " " + (height - 20) + " Td\n(1) Tj\nET\n" : "";
  const commands = Buffer.from(imageCommands + stampCommands, "ascii");
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "ascii"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + width + " " + height
      + "] /Resources << /XObject << /Im1 5 0 R >>"
      + (selectableStamp ? " /Font << /F1 6 0 R >>" : "")
      + " >> /Contents 4 0 R >>", "ascii"),
    Buffer.concat([Buffer.from("<< /Length " + commands.length + " >>\nstream\n", "ascii"), commands, Buffer.from("endstream", "ascii")]),
    Buffer.concat([Buffer.from("<< /Type /XObject /Subtype /Image /Width " + width
      + " /Height " + height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "
      + jpeg.length + " >>\nstream\n", "ascii"), jpeg, Buffer.from("\nendstream", "ascii")]),
  ];
  if (selectableStamp) objects.push(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "ascii"));
  const buffers = [Buffer.from("%PDF-1.4\n", "ascii")];
  const offsets = [0];
  let position = buffers[0].length;
  for (let i = 0; i < objects.length; i += 1) {
    const segment = Buffer.concat([Buffer.from((i + 1) + " 0 obj\n", "ascii"), objects[i], Buffer.from("\nendobj\n", "ascii")]);
    offsets.push(position);
    buffers.push(segment);
    position += segment.length;
  }
  let xref = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) xref += String(offset).padStart(10, "0") + " 00000 n \n";
  xref += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + position + "\n%%EOF\n";
  buffers.push(Buffer.from(xref, "ascii"));
  return new Uint8Array(Buffer.concat(buffers));
}

async function rasterizePdfImage(pdfBytes, expectNativeStamp = false) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: pdfBytes, useSystemFonts: true });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 1, "image-only PDF has exactly one page");
    const page = await pdf.getPage(1);
    try {
      const native = await page.getTextContent();
      const tokens = native.items.map((entry) => entry.str ?? "").filter(Boolean);
      if (expectNativeStamp) {
        assert.deepEqual(tokens, ["1"], "hybrid scanned page has one selectable stamp but no body text");
        assert.equal(pdfNativeTextNeedsVisualOcr(tokens.map((text) => ({
          text, confidence: 1, box: { x: 0.9, y: 0.1, width: 0.02, height: 0.02 },
        }))), true, "sparse native stamp must not bypass the visual OCR path");
      } else {
        assert.deepEqual(tokens, [], "image-only page cannot be mistaken for native text PDF");
      }
      const viewport = page.getViewport({ scale: 1 });
      const target = pdf.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvas: target.canvas, canvasContext: target.context, viewport, canvasFactory: pdf.canvasFactory }).promise;
        return Buffer.from(target.canvas.toBuffer("image/png"));
      } finally {
        pdf.canvasFactory.destroy?.(target);
      }
    } finally {
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
}

const rasterJpeg = canvas.toBuffer("image/jpeg");
const renderedScan = await rasterizePdfImage(embedRasterInPdf(rasterJpeg, 1000, 220));
const renderedHybrid = await rasterizePdfImage(embedRasterInPdf(rasterJpeg, 1000, 220, true), true);
assert.deepEqual([...renderedScan.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "scanned PDF rendered into PNG");

const root = process.cwd();
const workerOptions = {
  workerPath: path.join(root, "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
  corePath: path.join(root, "node_modules", "tesseract.js-core"),
  langPath: path.join(root, "node_modules", "@tesseract.js-data", "spa", "4.0.0"),
  cacheMethod: "none",
};
let worker;
try {
  worker = await createWorker("spa", 1, workerOptions);
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  const response = await worker.recognize(png, { rotateRadians: 0 }, { text: true });
  const text = String(response.data?.text ?? "").replace(/\s+/g, " ").trim();
  assert.match(text, /TOTAL/i, "real local Tesseract model detects total label");
  assert.match(text, /23[,.]45/, "real OCR keeps euro decimal digits in source text");
  console.log("PASS · local Spanish Tesseract OCR recognized TOTAL 23,45 from generated PNG");
  const pdfResult = await worker.recognize(renderedScan, { rotateRadians: 0 }, { text: true });
  const scannedText = String(pdfResult.data?.text ?? "").replace(/\s+/g, " ").trim();
  assert.match(scannedText, /TOTAL/i, "Spanish OCR detects label through scanned PDF");
  assert.match(scannedText, /23[,.]45/, "Spanish OCR retains financial decimals through JPEG/PDF/PNG pipeline");
  console.log("PASS · image-only PDF rasterized and recognized via local Spanish Tesseract");
  const hybridResult = await worker.recognize(renderedHybrid, { rotateRadians: 0 }, { text: true });
  const hybridText = String(hybridResult.data?.text ?? "").replace(/\s+/g, " ").trim();
  assert.match(hybridText, /TOTAL/i, "hybrid PDF visual body retains its invoice label");
  assert.match(hybridText, /23[,.]45/, "hybrid PDF visual body retains exact financial decimal");
  console.log("PASS · sparse-native hybrid PDF was correctly flagged and its raster recognized");
} finally {
  await worker?.terminate();
}
