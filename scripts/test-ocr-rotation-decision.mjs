// Synthetic policy test. Counts recognition passes; not an OCR accuracy benchmark.
import assert from "node:assert/strict";
import { ocrNeedsRotationFallback } from "../src/infrastructure/ocr/ocr-rotation-decision.ts";

const confidentWords = [
  "Factura", "Supermercado", "Línea", "Cantidad", "Precio", "Importe", "Total", "Pagado",
  "Fecha", "Tarjeta",
].map((text) => ({ text, confidence: 0.96 }));
const sparseWords = [
  { text: "TOTAL", confidence: 0.96 },
  { text: "23,45", confidence: 0.96 },
];
const lowConfidenceWords = confidentWords.map((word) => ({ ...word, confidence: 0.45 }));

assert.equal(ocrNeedsRotationFallback(confidentWords, { width: 1200, height: 700 }), false,
  "confident landscape invoice does not require three additional OCR passes");
assert.equal(ocrNeedsRotationFallback(confidentWords, { width: 700, height: 1200 }), false,
  "confident portrait invoice does not require redundant rotation");
assert.equal(ocrNeedsRotationFallback(sparseWords, { width: 1200, height: 700 }), true,
  "sparse landscape text still triggers orientation fallback");
assert.equal(ocrNeedsRotationFallback(sparseWords, { width: 700, height: 1200 }), true,
  "sparse portrait text still triggers orientation fallback");
assert.equal(ocrNeedsRotationFallback(lowConfidenceWords, { width: 1200, height: 700 }), true,
  "low confidence still triggers fallback regardless of text count");
assert.equal(ocrNeedsRotationFallback([], { width: 1200, height: 700 }), true,
  "blank page attempts alternative orientations");

console.log("PASS · six independent OCR orientation fallback decisions");
