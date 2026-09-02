import assert from "node:assert/strict";
import fs from "node:fs";
import { bulkOcrReprocessPlan, isBulkOcrReprocessCandidate, BULK_OCR_REPROCESS_LIMIT } from "../lib/document/ocr-bulk-reprocess-policy";

const current="image_ocr_receipt_v501:paddle_layout_v6:parser_v7:ppocrv6_es_geometry";
const previous="image_ocr_receipt_v501:paddle_layout_v6:parser_v6:ppocrv6_es_geometry";
const legacy="image_ocr_receipt_v501:paddle_layout_v6:parser_v2:ppocrv6_es_geometry";
const doc=(id:string,ocrStatus:string,method:string,options:{mimeType?:string;storageProvider?:string;links?:unknown[];bulkReprocessed?:boolean}={})=>({
  id,
  mimeType:options.mimeType||"image/jpeg",
  storageProvider:options.storageProvider||"supabase_storage",
  ocrStatus,
  ocrData:{method,bulkReprocessed:options.bulkReprocessed===true},
  links:options.links||[],
});

assert.equal(isBulkOcrReprocessCandidate(doc("legacy-complete","complete",legacy)),true,"Un OCR legado completo debe poder actualizar motor/parser");
assert.equal(isBulkOcrReprocessCandidate(doc("previous-complete","complete",previous)),true,"parser_v6 debe poder actualizarse una vez para aplicar la clasificación documental v7");
assert.equal(isBulkOcrReprocessCandidate(doc("current-review","needs_review",current)),true,"Un OCR actual pendiente puede reintentarse una vez por lote");
assert.equal(isBulkOcrReprocessCandidate(doc("failed","failed",current)),true,"Un fallo operativo puede reintentarse desde el original");
assert.equal(isBulkOcrReprocessCandidate(doc("error","error",current)),true,"Un error operativo puede reintentarse desde el original");
assert.equal(isBulkOcrReprocessCandidate(doc("already-tried","needs_review",current,{bulkReprocessed:true})),false,"Un OCR actual ya reprocesado no puede entrar en bucle automático");
assert.equal(isBulkOcrReprocessCandidate(doc("current-complete","complete",current)),false,"Un OCR actual completo no debe gastar recursos otra vez");
assert.equal(isBulkOcrReprocessCandidate(doc("manual","manual",legacy)),false,"Una revisión manual nunca puede ser sobrescrita por el lote");
assert.equal(isBulkOcrReprocessCandidate(doc("linked","needs_review",legacy,{links:[{id:"movement"}]})),false,"Un documento ya vinculado no debe cambiar metadatos en un lote automático");
assert.equal(isBulkOcrReprocessCandidate(doc("external","needs_review",legacy,{storageProvider:"google_drive"})),false,"El lote solo debe tocar originales privados disponibles directamente");
assert.equal(isBulkOcrReprocessCandidate(doc("pdf","needs_review",legacy,{mimeType:"application/pdf"})),false,"El lote de recuperación de imágenes no debe mezclar PDFs");

const many=Array.from({length:BULK_OCR_REPROCESS_LIMIT+3},(_,index)=>doc(String(index),"needs_review",current));
const plan=bulkOcrReprocessPlan(many);
assert.equal(plan.total,BULK_OCR_REPROCESS_LIMIT+3);
assert.equal(plan.selected.length,BULK_OCR_REPROCESS_LIMIT,"El lote debe estar acotado para evitar saturar navegador/servidor");
assert.equal(plan.remaining,3);
assert.equal(plan.limit,BULK_OCR_REPROCESS_LIMIT);
assert.deepEqual(plan.selected.map(item=>item.id),many.slice(0,BULK_OCR_REPROCESS_LIMIT).map(item=>item.id),"El plan debe ser determinista y conservar orden");

const wrapper=fs.readFileSync("app/archivo/archive-client-shell.tsx","utf8");
const page=fs.readFileSync("app/archivo/page.tsx","utf8");
const canonicalClient=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
assert.ok(wrapper.includes("ArchiveClientCore")&&wrapper.includes("ArchiveBulkOcrRecovery"),"El shell nuevo debe envolver el núcleo validado sin reescribirlo");
assert.ok(wrapper.includes('from "./archive-client"')&&page.includes('from "./archive-client-shell"'),"La página debe montar el shell mientras el núcleo conserva su ruta canónica histórica");
assert.ok(wrapper.includes("archiveRefreshKey")&&wrapper.includes("document.updatedAt"),"router.refresh debe poder remontar el núcleo con datos OCR actualizados");
assert.ok(wrapper.includes("pendingCount>0||recoveryCount>0")&&wrapper.includes("shouldCheck={shouldCheckRecovery}"),"El shell debe consultar el plan cuando exista cualquier Pending global, aunque el OCR quede fuera de la primera página activa");
assert.ok(page.includes("pendingCount={pending}"),"La página debe transmitir al shell el contador Pending canónico global");
assert.ok(canonicalClient.includes("recognizeTicketImage(file,worker,onProgress,hint)"),"El núcleo OCR canónico debe seguir intacto en archive-client.tsx");

const client=fs.readFileSync("app/archivo/archive-bulk-ocr-recovery.tsx","utf8");
for(const token of [
  "shouldCheck",
  "if(!shouldCheck){setLoading(false);return;}",
  "async function runBulkRecovery",
  "for(let index=0;index<selected.length;index++)",
  "Actualizar OCR pendientes",
  "Originales procesados uno a uno",
  "/api/archive/reprocess-ocr",
  "failed+=1",
])assert.ok(client.includes(token),`Archivo debe integrar recuperación OCR masiva segura: ${token}`);
assert.ok(!/Promise\.all\s*\(\s*selected/.test(client),"El cliente no puede disparar varios OCR de recuperación en paralelo");

const route=fs.readFileSync("app/api/archive/reprocess-ocr/route.ts","utf8");
for(const token of [
  'financial_app_archive_lifecycle_overview',
  'p_state:"pending"',
  "while(offset<pendingTotal)",
  "offset+=payload.documents.length",
  "isBulkOcrReprocessCandidate(initial)",
  "download(initial.storagePath)",
  "const latest=await documentDetail",
  "isBulkOcrReprocessCandidate(latest)",
  "buildStoredReceiptPersistence(latest,result)",
  "financial_app_archive_update",
])assert.ok(route.includes(token),`La API de recuperación debe proteger descubrimiento paginado, original, carreras y escritura: ${token}`);
assert.ok(!route.includes('financial_app_archive_overview'),"La recuperación no debe escanear la biblioteca activa completa cuando existe el ciclo Pending dedicado");
assert.ok(route.indexOf("const latest=await documentDetail")<route.indexOf("financial_app_archive_update"),"La comprobación de carrera debe ocurrir antes de cualquier escritura");
assert.ok(route.includes('reason:"changed_during_reprocess"'),"Una confirmación/vínculo concurrente debe cancelar la escritura");

console.log("OCR bulk reprocessing tests OK · parser_v6 legacy, parser_v7 actual, shell limpio, trigger Pending global, lote secuencial, sin bucles y carreras aisladas");
