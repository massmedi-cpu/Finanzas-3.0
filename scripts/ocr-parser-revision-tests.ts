import assert from "node:assert/strict";
import {
  RECEIPT_OCR_METHOD_PREFIX,
  RECEIPT_OCR_REVISION,
  RECEIPT_PARSER_REVISION,
  isCurrentReceiptOcrMethod,
} from "../lib/document/receipt-ocr-revision";

assert.equal(RECEIPT_OCR_REVISION,"paddle_layout_v6","El modelo OCR sigue siendo PP-OCRv6; la revisión cambia en la canalización, no en el modelo");
assert.equal(RECEIPT_PARSER_REVISION,"parser_v6","La recuperación de fechas concatenadas a FECHA debe distinguirse de parser_v5 y regenerar metadatos anteriores");
assert.equal(RECEIPT_OCR_METHOD_PREFIX,"image_ocr_receipt_v501:paddle_layout_v6:parser_v6:");
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v6:ppocrv6_es_geometry"),true);
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v5:ppocrv6_es_geometry"),false,"parser_v5 debe poder regenerarse para recuperar fechas OCR pegadas a su etiqueta");
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v4:ppocrv6_es_geometry"),false);
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v3:ppocrv6_es_geometry"),false);
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v2:ppocrv6_es_geometry"),false);
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v5:parser_v6:ppocrv6_es_geometry"),false);

console.log("OCR parser revision tests OK · parser_v6 current; v2/v3/v4/v5 legacy para regenerar fecha e importes con semántica documental actual");
