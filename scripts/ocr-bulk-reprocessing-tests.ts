import assert from "node:assert/strict";
import fs from "node:fs";
import { bulkOcrReprocessPlan, isBulkOcrReprocessCandidate, BULK_OCR_REPROCESS_LIMIT } from "../lib/document/ocr-bulk-reprocess-policy";

const current="image_ocr_receipt_v501:paddle_layout_v6:parser_v4:ppocrv6_es_geometry";
const legacy="image_ocr_receipt_v501:paddle_layout_v6:parser_v2:ppocrv6_es_geometry";
const doc=(id:string,ocrStatus:string,method:string,mimeType="image/jpeg")=>({id,mimeType,ocrStatus,ocrData:{method}});

assert.equal(isBulkOcrReprocessCandidate(doc("legacy-complete","complete",legacy)),true,"Un OCR legado completo debe poder actualizar motor/parser");
assert.equal(isBulkOcrReprocessCandidate(doc("current-review","needs_review",current)),true,"Un OCR actual pendiente puede reintentarse");
assert.equal(isBulkOcrReprocessCandidate(doc("failed","failed",current)),true,"Un fallo operativo puede reintentarse desde el original");
assert.equal(isBulkOcrReprocessCandidate(doc("error","error",current)),true,"Un error operativo puede reintentarse desde el original");
assert.equal(isBulkOcrReprocessCandidate(doc("current-complete","complete",current)),false,"Un OCR actual completo no debe gastar recursos otra vez");
assert.equal(isBulkOcrReprocessCandidate(doc("manual","manual",legacy)),false,"Una revisión manual nunca puede ser sobrescrita por el lote");
assert.equal(isBulkOcrReprocessCandidate(doc("pdf","needs_review",legacy,"application/pdf")),false,"El lote de recuperación de imágenes no debe mezclar PDFs");

const many=Array.from({length:BULK_OCR_REPROCESS_LIMIT+3},(_,index)=>doc(String(index),"needs_review",current));
const plan=bulkOcrReprocessPlan(many);
assert.equal(plan.total,BULK_OCR_REPROCESS_LIMIT+3);
assert.equal(plan.selected.length,BULK_OCR_REPROCESS_LIMIT,"El lote debe estar acotado para evitar saturar navegador/servidor");
assert.equal(plan.remaining,3);
assert.equal(plan.limit,BULK_OCR_REPROCESS_LIMIT);
assert.deepEqual(plan.selected.map(item=>item.id),many.slice(0,BULK_OCR_REPROCESS_LIMIT).map(item=>item.id),"El plan debe ser determinista y conservar orden");

const client=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
for(const token of [
  '"ocr-bulk"',
  "bulkOcrReprocessPlan",
  "runStoredOcrUpgrade",
  "async function bulkReprocessOcr",
  "for(let index=0;index<plan.selected.length;index++)",
  "Actualizar OCR pendientes",
  "Originales procesados uno a uno",
])assert.ok(client.includes(token),`Archivo debe integrar recuperación OCR masiva segura: ${token}`);
assert.ok(!/Promise\.all\s*\(\s*plan\.selected/.test(client),"El lote no puede disparar OCR de varios originales en paralelo");
assert.ok(client.includes("if(body.document.ocrStatus===\"manual\")"),"Debe volver a comprobar manual tras leer el detalle para evitar carreras");
assert.ok(client.includes("const body=await detailResponse.json() as DetailPayload"),"Cada original debe obtener URL privada fresca antes de OCR");
assert.ok(client.includes("failed+=1")&&client.includes("continue"),"Un fallo individual debe contabilizarse y permitir continuar el resto del lote");

console.log("OCR bulk reprocessing tests OK · manual protegido, lote acotado, secuencial, original-first y fallos aislados");
