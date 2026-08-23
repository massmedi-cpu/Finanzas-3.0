import assert from "node:assert/strict";
import { inferDocumentMetadata, normalizeOcrText } from "../lib/document/ticket-ocr";

const tobacco = inferDocumentMetadata(`
ESTANCO LOS PRINCIPES
C/ PRINCIPES 12 SEVILLA
NIF B12345678
21/08/2026 18:42
TABACO 8,50 €
TOTAL A PAGAR 8,50 €
TARJETA 8,50 €
`, "receipt");
assert.equal(tobacco.documentType, "receipt");
assert.equal(tobacco.documentDate, "2026-08-21");
assert.equal(tobacco.amount, 8.5);
assert.equal(tobacco.merchant, "ESTANCO LOS PRINCIPES");

const restaurant = inferDocumentMetadata(`
RESTAURANTE LA CASA
CIF A87654321
23-08-26 14:21
2 MENU DEL DIA 24,00
IVA 2,40
TOTAL 26,40 EUR
`, "receipt");
assert.equal(restaurant.documentDate, "2026-08-23");
assert.equal(restaurant.amount, 26.4);
assert.equal(restaurant.merchant, "RESTAURANTE LA CASA");

const invoice = inferDocumentMetadata(`
ENERGIA EJEMPLO S.L.
FACTURA 2026/0081
FECHA 20/08/2026
IMPORTE TOTAL 54,37 EUR
`, null);
assert.equal(invoice.documentType, "invoice");
assert.equal(invoice.documentDate, "2026-08-20");
assert.equal(invoice.amount, 54.37);

const cleaned = normalizeOcrText("|||\n  ESTANCO   LOS PRINCIPES  \n@@@\nTOTAL 8,50 €");
assert.ok(cleaned.includes("ESTANCO LOS PRINCIPES"));
assert.ok(!cleaned.includes("@@@"));

console.log("ticket-ocr-v302-tests OK");
