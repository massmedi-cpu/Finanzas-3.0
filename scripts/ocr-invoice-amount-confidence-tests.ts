import assert from "node:assert/strict";
import { inferDocumentMetadata } from "../lib/document/ticket-ocr";

const degradedCommercial=`77 ALBARAN
FECHA 28/08/2026
[cantidad] Codigo Articulo Precio IVA subtotal
5,00 10001 PRODUCTO 125,320 21,00 626,600
1,00 10002 PRODUCTO 52,600 21,00 52,600
Subtotal 679,200
TOTAL ALBARAN 679,200
821,830`;
const degraded=inferDocumentMetadata(degradedCommercial);
assert.equal(degraded.documentType,"invoice");
assert.equal(degraded.documentDate,"2026-08-28");
assert.equal(degraded.amount,null,"Una etiqueta TOTAL degradada no puede convertir subtotal/base en importe de factura sin corroboración financiera");

const corroboratedInvoice=`FACTURA 28/08/2026
BASE IMPONIBLE 679,20
IMPORTE IVA 142,63
TOTAL FACTURA 821,83`;
const corroborated=inferDocumentMetadata(corroboratedInvoice);
assert.equal(corroborated.documentType,"invoice");
assert.equal(corroborated.amount,821.83,"Base + IVA presentes y bruto visible sí constituyen evidencia suficiente para conservar el importe");

const receipt=inferDocumentMetadata(`TICKET
28/08/2026
TOTAL A PAGAR: 14,60 EUR`,"receipt");
assert.equal(receipt.documentType,"receipt");
assert.equal(receipt.amount,14.6,"El endurecimiento de factura no debe eliminar el total explícito de un ticket");

const generic=inferDocumentMetadata(`EXTRACTO
IMPORTE TOTAL 125,50 EUR`);
assert.equal(generic.documentType,"statement");
assert.equal(generic.amount,125.5,"Documentos no factura conservan el fallback genérico existente");

console.log("OCR invoice amount confidence tests OK · subtotal no corroborado => null; base+IVA+bruto => importe; tickets y otros documentos sin regresión");
