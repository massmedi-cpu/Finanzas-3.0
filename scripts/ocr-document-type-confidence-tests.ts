import assert from "node:assert/strict";
import { inferDocumentMetadata } from "../lib/document/ticket-ocr";

const barAvilaOcr = `Avila Bar - Victoria Ken
t
Razon Social: Luis Enrique ramirez mendoza
N.I.F.: Y6398422C
Direccion: Calle Victoria Kent
Direccion fiscal: Calle victoria kent 3 local 3b
y 4A, , Sevilla, ES, SE
Telefono: +34 641552438
Pedido por: Staff - LUIS HERNANDEZ
Hora:2026-08-22 00:02:03
DESCRIPCION    UDS PRECIO IMPORTE
ENERGY    1  1.80 1.80
TERCIO GALICIA CERO    1 2.80 2.80
CANA GRANDE    2 2.80 5.60
CUBATA    1 5.50 5.50
AGUA CON GAS    1  1.80 1.80
Base:    15.91
Total IVA    1.59
Total:  17.50
PENDIENTE DE PAGO
Mesa T29
Terraza
Powered by qamarero.com`;

const bar = inferDocumentMetadata(barAvilaOcr);
assert.equal(bar.documentType,"receipt","Un ticket de hostelería no puede convertirse en impuesto solo por incluir base/IVA");
assert.equal(bar.documentDate,"2026-08-22");
assert.equal(bar.amount,17.5);
assert.equal(bar.merchant,"Avila Bar - Victoria Ken");

const invoice = inferDocumentMetadata(`FACTURA F-2026-18\nBase imponible 100,00\nIVA 21,00\nTOTAL FACTURA 121,00`);
assert.equal(invoice.documentType,"invoice","Factura mantiene prioridad aunque incluya IVA");

const tax = inferDocumentMetadata(`AGENCIA TRIBUTARIA\nModelo 303\nAutoliquidación IVA\nImporte 121,00 EUR`);
assert.equal(tax.documentType,"tax","Los documentos fiscales con evidencia fuerte siguen clasificándose como impuesto");

const weakVat = inferDocumentMetadata(`Resumen de compra\nBase 15,91\nTotal IVA 1,59\nTotal 17,50`);
assert.notEqual(weakVat.documentType,"tax","IVA aislado no es evidencia suficiente para clasificar como impuesto");

const hintedReceipt = inferDocumentMetadata(`Comercio ejemplo\nBase 15,91\nTotal IVA 1,59\nTotal 17,50`,"receipt");
assert.equal(hintedReceipt.documentType,"receipt","El hint de captura de recibo sigue siendo válido cuando no hay evidencia fiscal fuerte");

console.log("OCR document type confidence tests OK · IVA aislado no fuerza tax; evidencia fiscal fuerte y estructura de ticket se separan correctamente");
