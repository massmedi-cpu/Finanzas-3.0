import assert from "node:assert/strict";
import { buildReceiptVisualModel, type ReceiptVisualLayoutInput } from "../lib/document/receipt-visual-model";

const layout: ReceiptVisualLayoutInput = {
  bounds: { width: 420, height: 760 },
  lines: [
    { text: "CAFETERIA", score: 98, left: 34, top: 5, width: 32, height: 3 },
    { text: "PAN", score: 98, left: 3.5, top: 27, width: 15, height: 2.8 },
    { text: "1,20", score: 98, left: 80, top: 27, width: 12, height: 2.8 },
    { text: "CAFE SOLO", score: 98, left: 3.5, top: 33, width: 28, height: 2.8 },
    { text: "1,40", score: 98, left: 80, top: 33, width: 12, height: 2.8 },
    { text: "TOSTADA", score: 98, left: 3.5, top: 39, width: 25, height: 2.8 },
    { text: "2,10", score: 98, left: 80, top: 39, width: 12, height: 2.8 },
    { text: "TOTAL", score: 99, left: 54, top: 50, width: 16, height: 3 },
    { text: "4,70", score: 99, left: 80, top: 50, width: 12, height: 3 },
  ],
};

const visual = buildReceiptVisualModel(layout);
for (const description of ["PAN", "CAFE SOLO", "TOSTADA"]) {
  const token = visual.tokens.find((candidate) => candidate.text === description);
  assert.ok(token, `${description} debe conservarse aunque la tabla empiece casi en el borde izquierdo`);
  assert.ok(token.renderX <= visual.width * 0.08, `${description} debe conservar el inicio físico izquierdo y no desplazarse a un margen artificial`);
}

const amounts = visual.tokens.filter((token) => ["1,20", "1,40", "2,10"].includes(token.text));
assert.equal(amounts.length, 3, "los importes de la tabla de dos columnas deben conservarse");
assert.equal(new Set(amounts.map((token) => Math.round(token.renderX))).size, 1, "los importes deben seguir compartiendo la misma ancla derecha");

console.log("OCR left-edge description tests OK · tablas sin cantidad conservan descripciones junto al borde real");
