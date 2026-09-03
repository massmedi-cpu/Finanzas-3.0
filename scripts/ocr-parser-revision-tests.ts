import assert from "node:assert/strict";
import {
  RECEIPT_OCR_METHOD_PREFIX,
  RECEIPT_OCR_REVISION,
  RECEIPT_PARSER_REVISION,
  hasCurrentReceiptParser,
  isCompatibleReceiptOcrMethod,
  isCurrentReceiptOcrMethod,
  needsReceiptMetadataReparse,
  upgradeReceiptParserMethod,
} from "../lib/document/receipt-ocr-revision";

const tesseractV8="image_ocr_receipt_v501:server_tesseract_7_geometry_v1:parser_v8:server_tesseract_7_geometry";
const tesseractV7="image_ocr_receipt_v501:server_tesseract_7_geometry_v1:parser_v7:server_tesseract_7_geometry";
const paddleV8="image_ocr_receipt_v501:paddle_layout_v6:parser_v8:ppocrv6_es_geometry";
const paddleV7="image_ocr_receipt_v501:paddle_layout_v6:parser_v7:ppocrv6_es_geometry";

assert.equal(RECEIPT_OCR_REVISION,"server_tesseract_7_geometry_v1","La revisión visual actual debe seguir describiendo Tesseract 7 y su geometría real");
assert.equal(RECEIPT_PARSER_REVISION,"parser_v8","La interpretación de totales documentales debe quedar versionada independientemente del OCR visual");
assert.equal(RECEIPT_OCR_METHOD_PREFIX,"image_ocr_receipt_v501:server_tesseract_7_geometry_v1:parser_v8:");
assert.equal(isCurrentReceiptOcrMethod(tesseractV8),true);
assert.equal(hasCurrentReceiptParser(tesseractV8),true);
assert.equal(needsReceiptMetadataReparse(tesseractV8),false);

assert.equal(isCompatibleReceiptOcrMethod(tesseractV7),true,"Tesseract 7 + geometría actual no debe volver a ejecutar OCR solo por cambiar el parser");
assert.equal(isCurrentReceiptOcrMethod(tesseractV7),false);
assert.equal(needsReceiptMetadataReparse(tesseractV7),true);
assert.equal(upgradeReceiptParserMethod(tesseractV7),tesseractV8);

assert.equal(isCompatibleReceiptOcrMethod(paddleV7),true,"La revisión visual legacy ya considerada equivalente sigue siendo reutilizable para reparseo");
assert.equal(needsReceiptMetadataReparse(paddleV7),true);
assert.equal(upgradeReceiptParserMethod(paddleV7),paddleV8);
assert.equal(hasCurrentReceiptParser(paddleV8),true,"Parser actual no implica fingir que la procedencia visual Paddle sea Tesseract");
assert.equal(isCurrentReceiptOcrMethod(paddleV8),false,"La procedencia visual histórica nunca puede presentarse como OCR actual");

assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:server_tesseract_7_geometry_v1:parser_v6:server_tesseract_7_geometry"),false,"Incluso con geometría Tesseract actual, parser_v6 queda fuera del atajo para no asumir compatibilidad no demostrada");
assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v6:ppocrv6_es_geometry"),false,"parser_v6 y anteriores necesitan regeneración visual canónica");
assert.equal(isCompatibleReceiptOcrMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v2:ppocrv6_es_geometry"),false);
assert.equal(upgradeReceiptParserMethod("image_ocr_receipt_v501:paddle_layout_v6:parser_v2:ppocrv6_es_geometry"),null);

console.log("OCR parser revision tests OK · parser_v8 separado de OCR visual; solo evidencia v7 demostrada se reinterpreta sin rerun de Tesseract");
