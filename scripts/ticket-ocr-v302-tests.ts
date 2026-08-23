import assert from "node:assert/strict";
import {
  estimateDeskewFromSamples,
  inferDocumentMetadata,
  normalizeOcrText,
  reconstructTsvReceipt,
  scoreReceiptCandidate,
  shouldRefineReceiptCandidates,
} from "../lib/document/ticket-ocr-v307";

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

const realRestaurantText = `
MI RESTAURANTE
Hora : 2026-07-11 16:41:59
Mesa : TERRAZA-13
Camarero : ADMIN
DESCRIPCION            UDS  PRECIO  TOTAL
CAÑA GRANDE              3   2.80    8.40
CORTADA                  4   1.80    7.20
COPA DE VINO             1   2.50    2.50
HAMBURGUESA CLASI        1   7.00    7.00
HAMBURGUESA ESP CA       1   8.00    8.00
SERRANITO DE POLLO       1   6.00    6.00
CUBATA                    1   5.50    5.50
Base imponible : 40.55
IVA (10%) : 4.05
TOTAL: 44.60 EUR
PENDIENTE
`;
const realRestaurant = inferDocumentMetadata(realRestaurantText, "receipt");
assert.equal(realRestaurant.documentDate, "2026-07-11");
assert.equal(realRestaurant.amount, 44.6);
assert.equal(realRestaurant.merchant, "MI RESTAURANTE");

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

const tsv=[
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
  "5\t1\t1\t1\t1\t1\t100\t20\t80\t25\t91\tMI",
  "5\t1\t1\t1\t1\t2\t190\t20\t180\t25\t94\tRESTAURANTE",
  "5\t1\t1\t1\t2\t1\t90\t60\t40\t25\t8\tZZ",
  "5\t1\t1\t1\t3\t1\t100\t100\t85\t25\t93\tTOTAL:",
  "5\t1\t1\t1\t3\t2\t260\t100\t50\t25\t90\t44",
  "5\t1\t1\t1\t3\t3\t325\t100\t40\t25\t89\t60",
  "5\t1\t1\t1\t3\t4\t380\t100\t55\t25\t95\tEUR",
].join("\n");
const structured=reconstructTsvReceipt(tsv);
assert.ok(structured);
assert.ok(structured.text.includes("MI RESTAURANTE"));
assert.ok(structured.text.includes("44,60"));
assert.ok(!structured.text.includes("ZZ"));

const skewSamples:Array<{x:number;y:number}>=[];
const skewDegrees=3;
const slope=Math.tan(skewDegrees*Math.PI/180);
for(let line=0;line<7;line+=1){for(let x=20;x<=780;x+=8){skewSamples.push({x,y:40+line*60+slope*x});}}
const estimated=estimateDeskewFromSamples(skewSamples,800,520);
assert.ok(Math.abs(estimated-skewDegrees)<=0.5,`deskew esperado ≈${skewDegrees}°, obtenido ${estimated}°`);

// Regresión observada en producción el 23/08/2026: una pasada con 74% produjo
// texto completo pero ruidoso, mientras otra declaró 95% con salida no útil.
const noisyProductionPass=`
MA MI RESTAURANTE
a Mora : 2026-07-11 16.41.59 A a
Mesa TERRAZA-13 Y
Camarero : ADMIN
DESCRIPCION UNS PRECIO TOTAL
CATA GRADE 3 280 8.40
CORTADA 4 1.80 7.20
COPA DE VINO 1 2.50 2.50 y
HAMBUERGUESA CLAST 1 7.00 7.00
HAMBURGUESA ESP CA 1 8.00 8,00 -
SERRANITO DE POLLO 1 6.00 6.00
SIN SALSA
CUBATA 1 5.50 5.50
Base imponible : 40.55
IVA (10%) 4.05
TOTAL: 44.60 EUR
`;
assert.ok(scoreReceiptCandidate(noisyProductionPass,74,"receipt")>scoreReceiptCandidate("",95,"receipt"),"una confianza alta sin texto útil no puede ganar");
assert.ok(scoreReceiptCandidate(realRestaurantText,95,"receipt")>scoreReceiptCandidate(noisyProductionPass,74,"receipt"),"una lectura completa y más fiable debe ganar a la lectura ruidosa");
assert.equal(shouldRefineReceiptCandidates([{text:noisyProductionPass,confidence:74},{text:"",confidence:95}],"receipt"),true,"si dos pasadas discrepan o una queda vacía debe ejecutarse una tercera lectura");

console.log("ticket-ocr-v302-tests OK · engine 3.0.7 · selección de pasadas protegida");
