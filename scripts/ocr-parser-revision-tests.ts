import assert from "node:assert/strict";
import {
  RECEIPT_OCR_METHOD_PREFIX,
  RECEIPT_OCR_REVISION,
  RECEIPT_PARSER_REVISION,
  isCurrentReceiptOcrMethod,
} from "../lib/document/receipt-ocr-revision";

assert.equal(RECEIPT_OCR_REVISION,"paddle_layout_v6","La revisión del motor PP-OCRv6 no debe fingir un cambio de modelo");
assert.equal(RECEIPT_PARSER_REVISION,"parser_v3","Las reglas de transporte/filtrado/reconstrucción nuevas deben tener revisión propia");
assert.equal(RECEIPT_OCR_METHOD_PREFIX,"image_ocr_receipt_v501:paddle_layout_v6:parser_v3:");
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v3:ppocrv6_es_geometry"),true);
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v2:ppocrv6_es_geometry"),false,"Los documentos parser_v2 deben considerarse obsoletos para poder regenerarse al abrirlos");
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v5:parser_v3:ppocrv6_es_geometry"),false);

console.log("OCR parser revision tests OK · parser_v3 current, parser_v2 legacy and eligible for reprocessing");
