import assert from "node:assert/strict";
import fs from "node:fs";
import { buildReceiptVisualModel, type ReceiptVisualLayoutInput } from "../lib/document/receipt-visual-model";
import { normalizeReceiptRowPerspective } from "../lib/document/receipt-row-perspective";
import { receiptPhysicalPreviewLayout } from "../lib/document/receipt-visual-physical-layout";
import { receiptMoneyDisplayText } from "../lib/document/receipt-money-display";
import { receiptFontProfile } from "../lib/document/receipt-font-profile";
import { serverReceiptOcrSize } from "../lib/document/server-receipt-image-preprocessor";

function visual(layout: ReceiptVisualLayoutInput) {
  return buildReceiptVisualModel(layout);
}

// 1) Papel aislado + 4 columnas + pendiente residual. La recuperación de
// márgenes físicos y la normalización geométrica deben convivir sin perder
// cantidad, descripción, precio ni importe.
const physicalSloped = {
  sourceWidth: 720,
  sourceHeight: 1320,
  bounds: { left: 72, top: 132, right: 648, bottom: 1188, width: 576, height: 1056 },
  lines: [
    { text: "UND.", score: 98, left: 7, top: 18.0, width: 8, height: 2.5 },
    { text: "DESCRIPCION", score: 98, left: 21, top: 18.25, width: 24, height: 2.5 },
    { text: "PRECIO", score: 98, left: 66, top: 19.15, width: 12, height: 2.5 },
    { text: "IMPORTE", score: 98, left: 84, top: 19.5, width: 12, height: 2.5 },
    { text: "1", score: 98, left: 9, top: 27.0, width: 2, height: 2.5 },
    { text: "PRODUCTO ALFA", score: 98, left: 21, top: 27.25, width: 27, height: 2.5 },
    { text: "2.50", score: 98, left: 68, top: 28.2, width: 8, height: 2.5 },
    { text: "2.50 €", score: 98, left: 86, top: 28.55, width: 10, height: 2.5 },
    { text: "2", score: 98, left: 9, top: 34.0, width: 2, height: 2.5 },
    { text: "PRODUCTO BETA", score: 98, left: 21, top: 34.25, width: 27, height: 2.5 },
    { text: "1,20", score: 98, left: 68, top: 35.2, width: 8, height: 2.5 },
    { text: "2,40", score: 98, left: 87, top: 35.55, width: 8, height: 2.5 },
    { text: "3", score: 98, left: 9, top: 41.0, width: 2, height: 2.5 },
    { text: "PRODUCTO GAMMA", score: 98, left: 21, top: 41.25, width: 29, height: 2.5 },
    { text: "1,00", score: 98, left: 68, top: 42.2, width: 8, height: 2.5 },
    { text: "3,00", score: 98, left: 87, top: 42.55, width: 8, height: 2.5 },
    { text: "GRACIAS POR SU VISITA", score: 98, left: 31, top: 88, width: 38, height: 2.0 },
  ],
};
const physical = receiptPhysicalPreviewLayout(physicalSloped);
assert.equal(physical.bounds.width, 720, "un ticket aislado debe recuperar el ancho físico completo");
assert.equal(physical.bounds.height, 1320, "un ticket aislado debe recuperar el alto físico completo");
const normalized = normalizeReceiptRowPerspective(physical);
assert.notStrictEqual(normalized, physical, "la pendiente repetida debe corregirse antes de agrupar filas");
const fourColumn = visual(normalized);
for (const qty of ["1", "2", "3"]) {
  const token = fourColumn.tokens.find((candidate) => candidate.text === qty);
  assert.ok(token && token.textAnchor === "end", `cantidad ${qty} debe conservar la columna de unidades`);
}
const rightMoney = fourColumn.tokens.filter((token) => ["2,50", "2,40", "3,00"].includes(token.text) && token.textAnchor === "end" && token.renderX > fourColumn.width * 0.8);
assert.equal(rightMoney.length, 3, "las tres filas deben conservar su importe derecho");
assert.equal(new Set(rightMoney.map((token) => Math.round(token.renderX))).size, 1, "los importes deben compartir ancla tras perspectiva + márgenes físicos");
const footer = fourColumn.tokens.find((token) => token.text.includes("GRACIAS POR SU VISITA"));
assert.ok(footer && footer.textAnchor === "middle", "un pie realmente centrado debe seguir centrado tras toda la cadena visual");

// 2) Ticket estrecho sin cabecera ni cantidad: descripción cerca del borde +
// importe. Debe descubrirse como tabla implícita y no perder el texto izquierdo.
const twoColumn = visual({ bounds: { width: 420, height: 760 }, lines: [
  { text: "CAFETERIA", score: 98, left: 34, top: 5, width: 32, height: 3.2 },
  { text: "CAFE SOLO", score: 98, left: 3.5, top: 26, width: 27, height: 2.7 },
  { text: "1,40", score: 98, left: 80, top: 26, width: 11, height: 2.7 },
  { text: "TOSTADA ENTERA", score: 98, left: 3.5, top: 33, width: 39, height: 2.7 },
  { text: "2,10", score: 98, left: 80, top: 33, width: 11, height: 2.7 },
  { text: "ZUMO NATURAL", score: 98, left: 3.5, top: 40, width: 34, height: 2.7 },
  { text: "2,50", score: 98, left: 80, top: 40, width: 11, height: 2.7 },
  { text: "TOTAL", score: 99, left: 56, top: 52, width: 14, height: 3 },
  { text: "6,00", score: 99, left: 80, top: 52, width: 11, height: 3 },
] });
for (const text of ["CAFE SOLO", "TOSTADA ENTERA", "ZUMO NATURAL"]) {
  assert.ok(twoColumn.tokens.some((token) => token.text.includes(text)), `${text} no puede perderse por estar cerca del borde izquierdo`);
}
const twoAmounts = twoColumn.tokens.filter((token) => ["1,40", "2,10", "2,50"].includes(token.text));
assert.equal(new Set(twoAmounts.map((token) => Math.round(token.renderX))).size, 1, "la tabla de dos columnas debe mantener una única columna de importes");

// 3) Familia multilínea: cantidad + inicio de descripción y segunda línea con
// continuación + dinero. Las dos líneas deben conservar una única columna.
const wrapped = visual({ bounds: { width: 600, height: 900 }, lines: [
  { text: "UND.", score: 98, left: 8, top: 20, width: 8, height: 2.8 },
  { text: "DESCRIPCION", score: 98, left: 22, top: 20, width: 24, height: 2.8 },
  { text: "PRECIO", score: 98, left: 64, top: 20, width: 12, height: 2.8 },
  { text: "IMPORTE", score: 98, left: 82, top: 20, width: 14, height: 2.8 },
  { text: "1", score: 98, left: 9, top: 27, width: 2, height: 2.5 },
  { text: "HAMBURGUESA ESPECIAL", score: 97, left: 26, top: 27, width: 34, height: 2.5 },
  { text: "CON QUESO Y BACON", score: 97, left: 22, top: 31, width: 31, height: 2.5 },
  { text: "8,50", score: 98, left: 68, top: 31, width: 8, height: 2.5 },
  { text: "8,50", score: 98, left: 87, top: 31, width: 8, height: 2.5 },
  { text: "1", score: 98, left: 10, top: 37, width: 2, height: 2.5 },
  { text: "AGUA", score: 98, left: 22, top: 37, width: 10, height: 2.5 },
  { text: "1,50", score: 98, left: 68, top: 37, width: 8, height: 2.5 },
  { text: "1,50", score: 98, left: 87, top: 37, width: 8, height: 2.5 },
] });
const wrappedLead = wrapped.tokens.find((token) => token.text === "HAMBURGUESA ESPECIAL");
const wrappedContinuation = wrapped.tokens.find((token) => token.text === "CON QUESO Y BACON");
const wrappedFollowing = wrapped.tokens.find((token) => token.text === "AGUA");
assert.ok(wrappedLead && wrappedContinuation && wrappedFollowing);
assert.ok(Math.abs(wrappedLead.renderX - wrappedContinuation.renderX) < 1 && Math.abs(wrappedContinuation.renderX - wrappedFollowing.renderX) < 1, "las descripciones multilínea deben conservar un único inicio físico");

// 4) Apariencia monetaria: la reconstrucción visual debe conservar puntuación y
// moneda impresas cuando coinciden con el valor financiero validado.
assert.equal(receiptMoneyDisplayText("2,50", "2.50"), "2.50");
assert.equal(receiptMoneyDisplayText("2,50", "2.50 €"), "2.50 €");
assert.equal(receiptMoneyDisplayText("14,60", "1460 €"), "14,60 €");

// 5) Tipografía: evidencia monoespaciada fuerte debe sobrevivir al cierre; una
// muestra débil debe fallar cerrado a sans.
const monoWords = ["CAFE", "TOSTADA", "BEBIDA", "PRODUCTO", "SERVICIO", "GRACIAS", "VISITA", "CLIENTE", "CAMBIO"];
const mono = receiptFontProfile({ bounds: { width: 600, height: 1000 }, lines: monoWords.map((text, index) => ({ text, score: 98, left: 10, top: 8 + index * 6, width: Array.from(text).length * 1.83, height: 2 })) });
assert.equal(mono.monospace, true);
const weak = receiptFontProfile({ bounds: { width: 600, height: 1000 }, lines: monoWords.slice(0, 3).map((text, index) => ({ text, score: 98, left: 10, top: 10 + index * 5, width: 12, height: 2 })) });
assert.equal(weak.monospace, false);

// 6) Origen: Drive y navegador comparten la misma política de densidad útil.
assert.deepEqual(serverReceiptOcrSize(520, 1040), { width: 1000, height: 2000 });
assert.deepEqual(serverReceiptOcrSize(4080, 3072), { width: 3400, height: 2560 });
assert.deepEqual(serverReceiptOcrSize(1600, 1200), { width: 1600, height: 1200 });

// 7) Contratos de origen documental: Drive sigue entrando por el OCR canónico y
// PDF híbrido mantiene OCR por página, no un camino paralelo antiguo.
const hydration = fs.readFileSync("lib/document/drive-content-hydration.ts", "utf8");
const canonical = fs.readFileSync("lib/document/server-canonical-receipt.ts", "utf8");
const pdfPolicy = fs.readFileSync("scripts/pdf-hybrid-ocr-policy-tests.ts", "utf8");
assert.ok(hydration.includes("recognizeCanonicalReceiptBytes(bytes"), "Drive debe seguir usando el OCR canónico compartido");
assert.ok(canonical.includes("prepareServerReceiptImageBytes"), "el OCR servidor debe acondicionar físicamente la imagen antes de Tesseract");
assert.ok(pdfPolicy.includes("page"), "la cobertura PDF híbrida por página debe seguir protegida por pruebas específicas");

console.log("OCR final heterogeneous matrix OK · origen, papel, perspectiva, 2/4 columnas, multilínea, moneda, tipografía y PDF protegidos");
