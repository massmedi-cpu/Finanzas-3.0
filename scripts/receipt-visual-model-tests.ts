import assert from "node:assert/strict";
import { buildReceiptVisualModel } from "../lib/document/receipt-visual-model";

const layout = {
  bounds: { width: 600, height: 1000 },
  lines: [
    { text: "COMERCIO", score: 96, left: 36, top: 5, width: 28, height: 3.4 },
    { text: "CALLE PRINCIPAL", score: 95, left: 30, top: 10, width: 40, height: 2.6 },
    { text: "UND.", score: 98, left: 10, top: 25, width: 8, height: 3.1 },
    { text: "DESCRIPCION", score: 98, left: 23, top: 25.15, width: 28, height: 3.2 },
    { text: "PRECIO", score: 98, left: 64, top: 24.92, width: 13, height: 3.15 },
    { text: "IMPORTE", score: 98, left: 82, top: 25.08, width: 14, height: 3.05 },
    { text: "1", score: 96, left: 13, top: 31.05, width: 2, height: 2.6 },
    { text: "PRODUCTO A", score: 95, left: 23.3, top: 30.92, width: 28, height: 2.8 },
    { text: "1,60", score: 97, left: 68.1, top: 31.12, width: 8.1, height: 2.7 },
    { text: "1,60", score: 97, left: 87.4, top: 31.0, width: 8.2, height: 2.7 },
    { text: "1", score: 96, left: 13.1, top: 36.05, width: 2, height: 2.65 },
    { text: "PRODUCTO B", score: 95, left: 23.1, top: 35.94, width: 28, height: 2.82 },
    { text: "7,50", score: 97, left: 68.3, top: 36.1, width: 8.0, height: 2.72 },
    { text: "7,50", score: 97, left: 87.5, top: 36.02, width: 8.1, height: 2.72 },
    { text: "TOTAL", score: 99, left: 62, top: 50, width: 15, height: 3.8 },
    { text: "9,10", score: 99, left: 86.5, top: 50.1, width: 9.2, height: 3.75 },
    { text: "X", score: 32, left: 2, top: 92, width: 0.7, height: 0.8 },
  ],
};

const model = buildReceiptVisualModel(layout);
assert.equal(model.width, 600);
assert.equal(model.height, 1000);

const header = model.tokens.find((token) => token.text === "COMERCIO");
assert.ok(header);
const headerCenter = header.renderX + (header.textAnchor === "start" ? header.boxWidth / 2 : 0);
assert.ok(Math.abs(headerCenter - 300) < 12, "el bloque centrado debe conservar el centro geométrico");

const tableHeader = model.tokens.filter((token) => ["UND.", "DESCRIPCION", "PRECIO", "IMPORTE"].includes(token.text));
assert.equal(new Set(tableHeader.map((token) => Math.round(token.baselineY * 10))).size, 1, "una fila debe compartir baseline");

const price160 = model.tokens.find((token) => token.text === "1,60" && token.x < 500);
const price750 = model.tokens.find((token) => token.text === "7,50" && token.x < 500);
assert.ok(price160 && price750);
assert.equal(price160.textAnchor, "end");
assert.equal(price750.textAnchor, "end");
assert.ok(Math.abs(price160.renderX - price750.renderX) < 1.5, "precios repetidos deben compartir ancla derecha");

const amount160 = model.tokens.find((token) => token.text === "1,60" && token.x > 500);
const amount750 = model.tokens.find((token) => token.text === "7,50" && token.x > 500);
assert.ok(amount160 && amount750);
assert.ok(Math.abs(amount160.renderX - amount750.renderX) < 1.5, "importes deben compartir ancla derecha");

assert.equal(model.tokens.some((token) => token.text === "X"), false, "un outlier diminuto, aislado y poco fiable no debe ensanchar el layout");
assert.ok((header.fontSize || 0) > (model.tokens.find((token) => token.text === "CALLE PRINCIPAL")?.fontSize || 0), "la escala tipográfica debe conservar diferencias geométricas reales");
assert.ok(model.tokens.every((token) => Math.abs(token.letterSpacing) <= token.fontSize * 0.036), "el tracking debe permanecer acotado");

console.log("receipt visual model tests OK · baseline compartida · columnas ancladas · centrado · ruido y tracking controlados");
