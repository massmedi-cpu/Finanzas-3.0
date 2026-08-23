import assert from "node:assert/strict";
import {
  estimateDeskewFromSamples,
  inferDocumentMetadata,
  normalizeOcrText,
  reconstructTsvReceipt,
  scoreReceiptCandidate,
  shouldRefineReceiptCandidates,
} from "../lib/document/ticket-ocr-v307";
import { detectReceiptTextBounds, mergeReceiptTexts } from "../lib/document/ticket-ocr-engine";
import { parseReceiptLayout, parseReceiptTsvLayout, receiptLayoutTotal } from "../lib/document/receipt-layout";

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
const receiptTable=parseReceiptLayout(realRestaurantText);
assert.equal(receiptTable.items.length,7,"el ticket real debe producir siete líneas de producto");
assert.deepEqual(receiptTable.items[0],{description:"CAÑA GRANDE",quantity:"3",unitPrice:"2,80",total:"8,40"});
assert.deepEqual(receiptTable.items[2],{description:"COPA DE VINO",quantity:"1",unitPrice:"2,50",total:"2,50"});
assert.ok(receiptTable.summary.some(line=>line.label.toLowerCase().startsWith("total")&&line.value.includes("44.60")),"el total debe separarse de las líneas de producto");

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

const v307ProductionText=`
MI RESTAURANTE
Hora : 2026-07-11 16.41.59
Mesa : TERRAZA-13
E Camarero : ADMIN
UDS PRECIO TOTAL
CATA GRAME 3 280 8.40
CORTADA 4 1.80 7.20
COPA DE 1 2.50 2.50
HAMBUERGUESA 700 7.00
HAMBURGUESA ESP CA 1 8.00 8.00
SERRANITO DE POLLO 1 6.00 6.00
SIN SALSA
CUBATA 1 5,50 5,50
Base imponible : 40.55
IVA (10%) 4.05
44.60 EUR
PENDIENTE
`;
const sparseComplement=`
MI RESTAURANTE
Hora 2026-07-11 16:41:59
Mesa TERRAZA-13
Camarero ADMIN
DESCRIPCION UDS PRECIO TOTAL
CAÑA GRANDE 3 2.80 8.40
CORTADA 4 1.80 7.20
COPA DE VINO 1 2.50 2.50
HAMBURGUESA CLASI 1 7.00 7.00
HAMBURGUESA ESP CA 1 8.00 8.00
SERRANITO DE POLLO 1 6.00 6.00
SIN SALSA
CUBATA 1 5.50 5.50
Base imponible 40.55
IVA 10% 4.05
TOTAL 44.60 EUR
PENDIENTE
`;
const consensus=mergeReceiptTexts(v307ProductionText,sparseComplement);
assert.ok(consensus.includes("CAÑA GRANDE 3 2.80 8.40"),`debe reparar nombre y precio de CAÑA GRANDE: ${consensus}`);
assert.ok(consensus.includes("COPA DE VINO 1 2.50 2.50"),"debe recuperar palabras omitidas en una línea de producto");
assert.ok(consensus.includes("HAMBURGUESA CLASI 1 7.00 7.00"),"debe reparar cantidad/precio colapsados cuando la lectura complementaria es mejor");
const consensusMeta=inferDocumentMetadata(consensus,"receipt");
assert.equal(consensusMeta.documentDate,"2026-07-11");
assert.equal(consensusMeta.amount,44.6);
assert.equal(consensusMeta.merchant,"MI RESTAURANTE");
const consensusTable=parseReceiptLayout(consensus);
assert.ok(consensusTable.items.some(item=>item.description==="HAMBURGUESA CLASI"&&item.unitPrice==="7,00"&&item.total==="7,00"),"el consenso correcto debe quedar tabulado sin perder columnas");

// Regresión real: Ávila Bar. El OCR 3.0.8 confundía la hora 00.02.03 con 0,02 €,
// aceptaba el año imposible 2028 y elegía la razón social como nombre del comercio.
const avilaBadText=`
Avila Bar - Victor:
Razon Social: Luís Enrigue ramirez mendoza
hal Direccion: Calle Victoria Kent
Direccion fiscal: Calle victoria kent 3 loc
y AR, , ES, SE
Telefono: +34 641592438 L
Pedido por: Staff - LUIS WERNAWEL
Hora: 2028-08-22 00.02.03 N
DESCRIPCION UDS PRECI
ENERGY NA
TERCIO GALICIA CERO AO?
A e 1 Y Ne j
q , 4 A
A. Na
E el Y A
`;
const avilaBadMeta=inferDocumentMetadata(avilaBadText,"receipt");
assert.equal(avilaBadMeta.amount,null,"una hora nunca puede convertirse en importe del ticket");
assert.equal(avilaBadMeta.documentDate,null,"un recibo no debe aceptar como fecha un año futuro imposible");
assert.equal(avilaBadMeta.merchant,"Avila Bar - Victor:","Razón Social/Dirección no deben desplazar al nombre comercial de la primera línea");

const avilaTsv=[
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
  "5\t1\t1\t1\t1\t1\t105\t40\t78\t26\t91\tAvila","5\t1\t1\t1\t1\t2\t195\t40\t55\t26\t93\tBar","5\t1\t1\t1\t1\t3\t262\t40\t15\t26\t95\t-","5\t1\t1\t1\t1\t4\t292\t40\t92\t26\t92\tVictoria","5\t1\t1\t1\t1\t5\t396\t40\t52\t26\t90\tKent",
  "5\t1\t1\t1\t2\t1\t105\t85\t55\t22\t90\tHora:","5\t1\t1\t1\t2\t2\t175\t85\t122\t22\t94\t2026-08-22","5\t1\t1\t1\t2\t3\t310\t85\t82\t22\t94\t00:02:03",
  "5\t1\t1\t1\t3\t1\t100\t145\t170\t24\t96\tDESCRIPCION","5\t1\t1\t1\t3\t2\t560\t145\t50\t24\t96\tUDS","5\t1\t1\t1\t3\t3\t670\t145\t78\t24\t96\tPRECIO","5\t1\t1\t1\t3\t4\t800\t145\t92\t24\t96\tIMPORTE",
  "5\t1\t1\t1\t4\t1\t100\t190\t95\t23\t92\tENERGY","5\t1\t1\t1\t4\t2\t575\t190\t18\t23\t95\t1","5\t1\t1\t1\t4\t3\t688\t190\t52\t23\t95\t1.80","5\t1\t1\t1\t4\t4\t820\t190\t52\t23\t95\t1.80",
  "5\t1\t1\t1\t5\t1\t100\t230\t72\t23\t92\tTERCIO","5\t1\t1\t1\t5\t2\t180\t230\t82\t23\t92\tGALICIA","5\t1\t1\t1\t5\t3\t270\t230\t60\t23\t91\tCERO","5\t1\t1\t1\t5\t4\t575\t230\t18\t23\t95\t1","5\t1\t1\t1\t5\t5\t688\t230\t52\t23\t95\t2.80","5\t1\t1\t1\t5\t6\t820\t230\t52\t23\t95\t2.80",
  "5\t1\t1\t1\t6\t1\t100\t270\t70\t23\t92\tCAÑA","5\t1\t1\t1\t6\t2\t180\t270\t82\t23\t92\tGRANDE","5\t1\t1\t1\t6\t3\t575\t270\t18\t23\t95\t2","5\t1\t1\t1\t6\t4\t688\t270\t52\t23\t95\t2.80","5\t1\t1\t1\t6\t5\t820\t270\t52\t23\t95\t5.60",
  "5\t1\t1\t1\t7\t1\t100\t310\t82\t23\t92\tCUBATA","5\t1\t1\t1\t7\t2\t575\t310\t18\t23\t95\t1","5\t1\t1\t1\t7\t3\t688\t310\t52\t23\t95\t5.50","5\t1\t1\t1\t7\t4\t820\t310\t52\t23\t95\t5.50",
  "5\t1\t1\t1\t8\t1\t100\t350\t58\t23\t92\tAGUA","5\t1\t1\t1\t8\t2\t168\t350\t48\t23\t92\tCON","5\t1\t1\t1\t8\t3\t226\t350\t52\t23\t92\tGAS","5\t1\t1\t1\t8\t4\t575\t350\t18\t23\t95\t1","5\t1\t1\t1\t8\t5\t688\t350\t52\t23\t95\t1.80","5\t1\t1\t1\t8\t6\t820\t350\t52\t23\t95\t1.80",
  "5\t1\t1\t1\t9\t1\t570\t410\t58\t23\t93\tBase:","5\t1\t1\t1\t9\t2\t820\t410\t58\t23\t96\t15.91",
  "5\t1\t1\t1\t10\t1\t530\t450\t58\t23\t93\tTotal","5\t1\t1\t1\t10\t2\t600\t450\t38\t23\t93\tIVA","5\t1\t1\t1\t10\t3\t820\t450\t52\t23\t96\t1.59",
  "5\t1\t1\t1\t11\t1\t520\t500\t72\t28\t98\tTotal:","5\t1\t1\t1\t11\t2\t805\t500\t72\t28\t99\t17.50",
  "5\t1\t1\t1\t12\t1\t250\t560\t150\t30\t94\tPENDIENTE","5\t1\t1\t1\t12\t2\t415\t560\t48\t30\t94\tDE","5\t1\t1\t1\t12\t3\t475\t560\t75\t30\t94\tPAGO",
].join("\n");
const avilaLayout=parseReceiptTsvLayout(avilaTsv);
assert.ok(avilaLayout,"el TSV geométrico del ticket debe producir una tabla");
assert.equal(avilaLayout.source,"geometry_tsv");
assert.equal(avilaLayout.items.length,5);
assert.deepEqual(avilaLayout.items[0],{description:"ENERGY",quantity:"1",unitPrice:"1,80",total:"1,80"});
assert.deepEqual(avilaLayout.items[2],{description:"CAÑA GRANDE",quantity:"2",unitPrice:"2,80",total:"5,60"});
assert.deepEqual(avilaLayout.items[4],{description:"AGUA CON GAS",quantity:"1",unitPrice:"1,80",total:"1,80"});
assert.equal(receiptLayoutTotal(avilaLayout),17.5,"el total debe salir del bloque Total y no de la hora");
const bounds=detectReceiptTextBounds(avilaTsv,1000,800);
assert.ok(bounds.width<1000&&bounds.height<800,"el localizador debe poder recortar el bloque del ticket y excluir fondo ajeno");

console.log("ticket-ocr-v302-tests OK · OCR geométrico · total protegido · regresiones reales");
