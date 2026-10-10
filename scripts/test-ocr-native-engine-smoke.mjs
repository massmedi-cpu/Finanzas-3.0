// Offline Tesseract engine smoke: real raster pixels and bundled Spanish model.
// This is one controlled synthetic image, NOT accuracy certification on real bills.
import assert from "node:assert/strict";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker, PSM } from "tesseract.js";

const canvas = createCanvas(1000, 220);
const context = canvas.getContext("2d");
context.fillStyle = "#ffffff";
context.fillRect(0, 0, 1000, 220);
context.fillStyle = "#000000";
context.font = "bold 62px Arial";
context.fillText("TOTAL 23,45", 45, 145);
const png = canvas.toBuffer("image/png");
assert.ok(png.byteLength > 1000, "synthetic receipt image created");

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
} finally {
  await worker?.terminate();
}
