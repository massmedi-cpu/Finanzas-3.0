import assert from "node:assert/strict";
import { inferDocumentMetadata } from "../lib/document/ticket-ocr";

const cleanDomain=`www.fabricaciones-sur.com
ALBARAN 123
Fecha 28/08/2026
Cantidad Codigo Articulo Precio IVA Subtotal
1 100 PIEZA 10,00 21,00 10,00
TOTAL FACTURA 12,10`;
assert.equal(inferDocumentMetadata(cleanDomain,"receipt").merchant,"Fabricaciones Sur","Un dominio suficientemente íntegro puede identificar al emisor");

const corruptedClientBlock=`ALBARAN
CABECERA CLIENTE
POLIGONO INDUSTRIAL
SOC.COOP.AND.CLIENTE DESTINO
ss mn rfoan.es CHAPAS PERFORADAS
Fecha 28/08/2026
Cantidad Codigo Articulo Precio IVA Subtotal
5,00 09745 CHAPA 125,320 21,00 626,600`;
const corrupted=inferDocumentMetadata(corruptedClientBlock,"receipt");
assert.equal(corrupted.merchant,null,"Un dominio OCR corto/corrupto y texto de destinatario no pueden convertirse en emisor");
assert.notEqual(corrupted.merchant,"Rfoan");
assert.ok(!String(corrupted.merchant||"").includes("CLIENTE DESTINO"));

const shortHeader=`NORA
C/ MAYOR 12 TEL. 600000000
SEVILLA
TICKET 100
Fecha 29/08/2026
TOTAL 12,50`;
assert.equal(inferDocumentMetadata(shortHeader,"receipt").merchant,"NORA","Una cabecera comercial corta debe ganar a la dirección y localidad posteriores");

const legalName=`ACME SL
C/ INDUSTRIA 4
41000 SEVILLA
FACTURA 99
Fecha 28/08/2026
TOTAL FACTURA 25,00`;
assert.equal(inferDocumentMetadata(legalName,"receipt").merchant,"ACME SL","Una razón social limpia en cabecera debe seguir siendo válida");

const locationOnly=`C/ MAYOR 12 TEL. 600000000
SEVILLA
TICKET 101
Fecha 29/08/2026
TOTAL 8,00`;
assert.equal(inferDocumentMetadata(locationOnly,"receipt").merchant,null,"Una localidad detrás de una dirección no debe inventarse como comercio");

console.log("OCR merchant metadata confidence tests OK · dominios corruptos, bloque CLIENTE y ubicaciones rechazados; cabeceras y dominios limpios preservados");
