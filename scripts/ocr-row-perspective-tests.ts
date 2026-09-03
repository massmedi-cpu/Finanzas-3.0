import assert from "node:assert/strict";
import { buildReceiptVisualModel, type ReceiptVisualLayoutInput } from "../lib/document/receipt-visual-model";
import { normalizeReceiptRowPerspective } from "../lib/document/receipt-row-perspective";

const sloped: ReceiptVisualLayoutInput = {
  bounds: { width: 600, height: 900 },
  lines: [
    { text: "UND.", score: 98, left: 8, top: 20.0, width: 8, height: 2.5 },
    { text: "DESCRIPCION", score: 98, left: 22, top: 20.25, width: 24, height: 2.5 },
    { text: "PRECIO", score: 98, left: 66, top: 21.15, width: 12, height: 2.5 },
    { text: "IMPORTE", score: 98, left: 84, top: 21.5, width: 12, height: 2.5 },
    { text: "1", score: 98, left: 10, top: 28.0, width: 2, height: 2.5 },
    { text: "PRODUCTO UNO", score: 98, left: 22, top: 28.25, width: 25, height: 2.5 },
    { text: "3,00", score: 98, left: 68, top: 29.2, width: 8, height: 2.5 },
    { text: "3,00", score: 98, left: 87, top: 29.55, width: 8, height: 2.5 },
    { text: "2", score: 98, left: 10, top: 35.0, width: 2, height: 2.5 },
    { text: "PRODUCTO DOS", score: 98, left: 22, top: 35.25, width: 25, height: 2.5 },
    { text: "2,00", score: 98, left: 68, top: 36.2, width: 8, height: 2.5 },
    { text: "4,00", score: 98, left: 87, top: 36.55, width: 8, height: 2.5 },
    { text: "3", score: 98, left: 10, top: 42.0, width: 2, height: 2.5 },
    { text: "PRODUCTO TRES", score: 98, left: 22, top: 42.25, width: 26, height: 2.5 },
    { text: "1,00", score: 98, left: 68, top: 43.2, width: 8, height: 2.5 },
    { text: "3,00", score: 98, left: 87, top: 43.55, width: 8, height: 2.5 },
  ],
};

const normalized = normalizeReceiptRowPerspective(sloped);
assert.notStrictEqual(normalized, sloped, "una pendiente repetida entre columnas debe normalizarse");
const model = buildReceiptVisualModel(normalized);

for (const [quantity, price, amount] of [["1", "3,00", "3,00"], ["2", "2,00", "4,00"], ["3", "1,00", "3,00"]] as const) {
  const quantityToken = model.tokens.find((token) => token.text === quantity);
  const priceTokens = model.tokens.filter((token) => token.text === price);
  const amountToken = amount === price ? priceTokens.at(-1) : model.tokens.find((token) => token.text === amount);
  const priceToken = priceTokens[0];
  assert.ok(quantityToken && priceToken && amountToken, `la fila ${quantity} debe conservar cantidad, precio e importe`);
  assert.equal(quantityToken.rowIndex, priceToken.rowIndex, `precio de fila ${quantity} no puede separarse por perspectiva residual`);
  assert.equal(quantityToken.rowIndex, amountToken.rowIndex, `importe de fila ${quantity} no puede separarse por perspectiva residual`);
}

const rightAmounts = model.tokens.filter((token) => ["3,00", "4,00"].includes(token.text) && token.textAnchor === "end" && token.renderX > model.width * 0.8);
assert.ok(rightAmounts.length >= 3, "los importes inclinados deben seguir formando la columna derecha");
assert.equal(new Set(rightAmounts.map((token) => Math.round(token.renderX))).size, 1, "la perspectiva residual no debe romper el ancla de importes");

const tooSmall: ReceiptVisualLayoutInput = {
  bounds: { width: 500, height: 800 },
  lines: sloped.lines.slice(0, 5),
};
assert.strictEqual(normalizeReceiptRowPerspective(tooSmall), tooSmall, "con poca evidencia no se debe modificar el layout");

const flat: ReceiptVisualLayoutInput = {
  bounds: { width: 500, height: 800 },
  lines: [
    { text: "A", score: 98, left: 10, top: 10, width: 10, height: 3 },
    { text: "B", score: 98, left: 40, top: 10.05, width: 10, height: 3 },
    { text: "C", score: 98, left: 75, top: 10.02, width: 10, height: 3 },
    { text: "D", score: 98, left: 10, top: 20, width: 10, height: 3 },
    { text: "E", score: 98, left: 40, top: 20.04, width: 10, height: 3 },
    { text: "F", score: 98, left: 75, top: 20.01, width: 10, height: 3 },
    { text: "G", score: 98, left: 10, top: 30, width: 10, height: 3 },
    { text: "H", score: 98, left: 75, top: 30.03, width: 10, height: 3 },
  ],
};
assert.strictEqual(normalizeReceiptRowPerspective(flat), flat, "un ticket ya horizontal debe conservar exactamente su geometría");

console.log("OCR row perspective tests OK · pendiente residual corregida sin ampliar tolerancias ni tocar layouts ambiguos");
