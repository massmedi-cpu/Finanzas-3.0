import assert from "node:assert/strict";
import { inferDocumentMetadata } from "../lib/document/ticket-ocr";
import { RECEIPT_PARSER_REVISION } from "../lib/document/receipt-ocr-revision";

const productionReceipt=`Y
-    a;
JUAN
PISUERGA-SN    TEL. 686108450
CORIA DEL RIO    SEVILLA
C.LF.
|
TICKET N*    VENDEDOR 1
|    36572/1/ 001    HORA14:55:33
FECHA29/08/2026
END... DESCRIPCION PRECIO IMPORTE
|    1  CERVEZA 1/2    seo    300
1  CERVEZA SIN    1,60    160
1  PLATO DE PATATAS    2,00    2.00
1  CHURRASCO DE    7,50    7,50
1  SALSAS    —    0,50    0,50    tas
FORMA DE PAGO: EFECTIVO
L
TOTALA PAGAR: — 1460
IVA INCLUIDO
:    GRACIAS POR SU VISITA    |
LE ATENDIO JUAN MEJIAS`;

const metadata=inferDocumentMetadata(productionReceipt,"receipt");
assert.equal(RECEIPT_PARSER_REVISION,"parser_v6");
assert.equal(metadata.documentType,"receipt");
assert.equal(metadata.documentDate,"2026-08-29","FECHA pegada al valor debe conservar la fecha explícita del ticket");
assert.equal(metadata.merchant,"JUAN","La cabecera comercial debe ganar a la localidad situada debajo de dirección/teléfono");
assert.equal(metadata.amount,null,"1460 sin separador decimal no puede inventarse como 14,60 ni como 1.460");

const colon=inferDocumentMetadata("CAFETERIA CENTRAL\nFECHA:30/08/2026\nTOTAL 7,50","receipt");
assert.equal(colon.documentDate,"2026-08-30","La variante FECHA:dd/mm/yyyy debe conservarse");
assert.equal(colon.amount,7.5,"La mejora de fecha no puede romper un total explícito con decimales");

const invalid=inferDocumentMetadata("CAFETERIA CENTRAL\nFECHA32/13/2026\nTOTAL 7,50","receipt");
assert.equal(invalid.documentDate,null,"Una etiqueta fuerte no puede saltarse la validación de calendario");

console.log("OCR production concatenated date tests OK · FECHA29/08/2026 recuperada, JUAN preservado y 1460 ambiguo sigue sin convertirse en importe");
