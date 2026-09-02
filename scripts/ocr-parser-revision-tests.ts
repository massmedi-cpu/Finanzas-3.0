import assert from "node:assert/strict";
import {
  RECEIPT_OCR_METHOD_PREFIX,
  RECEIPT_OCR_REVISION,
  RECEIPT_PARSER_REVISION,
  isCurrentReceiptOcrMethod,
} from "../lib/document/receipt-ocr-revision";

assert.equal(RECEIPT_OCR_REVISION,"paddle_layout_v6","El modelo OCR sigue siendo PP-OCRv6; la revisión cambia en la canalización, no en el modelo");
assert.equal(RECEIPT_PARSER_REVISION,"parser_v4","La calidad de transporte para documentos densos debe invalidar las reconstrucciones v2/v3 anteriores");
assert.equal(RECEIPT_OCR_METHOD_PREFIX,"image_ocr_receipt_v501:paddle_layout_v6:parser_v4:");
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v4:ppocrv6_es_geometry"),true);
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v3:ppocrv6_es_geometry"),false,"Los documentos parser_v3 procesados con 2600px deben poder regenerarse con la entrada de mayor calidad");
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v2:ppocrv6_es_geometry"),false,"Los documentos parser_v2 continúan siendo elegibles para reprocessing");
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v5:parser_v4:ppocrv6_es_geometry"),false);

console.log("OCR parser revision tests OK · parser_v4 current; v2/v3 legacy and eligible for one safe higher-detail reprocessing");
