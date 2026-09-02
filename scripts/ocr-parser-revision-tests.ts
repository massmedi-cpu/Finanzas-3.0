import assert from "node:assert/strict";
import {
  RECEIPT_OCR_METHOD_PREFIX,
  RECEIPT_OCR_REVISION,
  RECEIPT_PARSER_REVISION,
  isCompatibleReceiptOcrMethod,
  isCurrentReceiptOcrMethod,
} from "../lib/document/receipt-ocr-revision";

assert.equal(RECEIPT_OCR_REVISION,"server_tesseract_7_geometry_v1","La revisión OCR actual debe describir el runtime y la geometría reales");
assert.equal(RECEIPT_PARSER_REVISION,"parser_v7","La clasificación fiscal endurecida debe permanecer en parser_v7");
assert.equal(RECEIPT_OCR_METHOD_PREFIX,"image_ocr_receipt_v501:server_tesseract_7_geometry_v1:parser_v7:");
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:server_tesseract_7_geometry_v1:parser_v7:server_tesseract_7_geometry"),true);
assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v7:ppocrv6_es_geometry"),true,"La revisión legacy equivalente debe seguir siendo compatible sin reprocesado masivo");
assert.equal(isCurrentReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v7:ppocrv6_es_geometry"),false,"La procedencia Paddle histórica no puede presentarse como actual");
assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v6:ppocrv6_es_geometry"),false,"parser_v6 debe poder regenerarse para aplicar la clasificación fiscal de alta confianza");
assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v5:ppocrv6_es_geometry"),false);
assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v4:ppocrv6_es_geometry"),false);
assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v3:ppocrv6_es_geometry"),false);
assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v2:ppocrv6_es_geometry"),false);
assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v5:parser_v7:ppocrv6_es_geometry"),false);

console.log("OCR parser revision tests OK · Tesseract actual, parser_v7 preservado y solo legacy equivalente compatible");
