import assert from "node:assert/strict";
import { buildReceiptVisualModel } from "../lib/document/receipt-visual-model";

const model = buildReceiptVisualModel({
  bounds: { width: 600, height: 1000 },
  lines: [
    { text: "COMERCIO", score: 99, left: 24, top: 5, width: 52, height: 5 },
    { text: "Calle principal 1", score: 98, left: 20, top: 15, width: 60, height: 2 },
    { text: "1 PRODUCTO 4,50", score: 99, left: 12, top: 30, width: 76, height: 2 },
    { text: "1 SERVICIO 3,20", score: 99, left: 12, top: 38, width: 76, height: 2 },
    { text: "TOTAL 7,70", score: 99, left: 58, top: 52, width: 30, height: 2.3 },
    { text: "GRACIAS POR SU VISITA", score: 99, left: 30, top: 89, width: 40, height: 1 },
  ],
});

const header = model.tokens.find((token) => token.text === "COMERCIO");
const body = model.tokens.find((token) => token.text.includes("Calle principal"));
const footer = model.tokens.find((token) => token.text === "GRACIAS POR SU VISITA");
assert.ok(header && body && footer, "deben existir cabecera, cuerpo y pie reconstruidos");
assert.ok(header.fontSize / body.fontSize >= 2.2, "una cabecera físicamente 2,5x más alta no debe comprimirse a una jerarquía casi uniforme");
assert.ok(footer.fontSize / body.fontSize <= 0.62, "un pie físicamente pequeño no debe engordarse hasta casi el tamaño del cuerpo");
assert.equal(header.textAnchor, "middle", "el centrado geométrico de una cabecera debe conservarse");
assert.equal(footer.textAnchor, "middle", "el centrado geométrico de un pie debe conservarse");

console.log("OCR physical type scale tests OK · cabeceras, cuerpo y pies conservan su jerarquía física medida");
