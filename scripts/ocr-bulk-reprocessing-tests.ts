import assert from "node:assert/strict";
import fs from "node:fs";
import { bulkOcrReprocessPlan, isBulkOcrReprocessCandidate, isLegacyReceiptOcrDocument, BULK_OCR_REPROCESS_LIMIT } from "../lib/document/ocr-bulk-reprocess-policy";
import { RECEIPT_OCR_METHOD_PREFIX } from "../lib/document/receipt-ocr-revision";

const current=`${RECEIPT_OCR_METHOD_PREFIX}server_tesseract_7_geometry`;
const compatibleLegacy="image_ocr_receipt_v501:paddle_layout_v6:parser_v7:ppocrv6_es_geometry";
const previous="image_ocr_receipt_v501:paddle_layout_v6:parser_v6:ppocrv6_es_geometry";
const legacy="image_ocr_receipt_v501:paddle_layout_v4:ppocrv6_es_paper_geometry";
const fastcropLegacy="image_ocr_receipt_v501:fastcrop_v3:fastcrop_gray_psm6";
const doc=(id:string,ocrStatus:string,method:string,options:{mimeType?:string;storageProvider?:string;links?:unknown[];bulkReprocessed?:boolean}={})=>({
  id,
  mimeType:options.mimeType||"image/jpeg",
  storageProvider:options.storageProvider||"supabase_storage",
  ocrStatus,
  ocrData:{method,bulkReprocessed:options.bulkReprocessed===true},
  links:options.links||[],
});

assert.equal(isLegacyReceiptOcrDocument(doc("legacy", "complete", legacy)),true);
assert.equal(isLegacyReceiptOcrDocument(doc("fastcrop", "complete", fastcropLegacy)),true);
assert.equal(isLegacyReceiptOcrDocument(doc("current", "complete", current)),false);
assert.equal(isBulkOcrReprocessCandidate(doc("legacy-complete","complete",legacy)),true,"Un OCR realmente legado complete debe poder actualizar motor/parser aunque no esté Pending");
assert.equal(isBulkOcrReprocessCandidate(doc("fastcrop-complete","complete",fastcropLegacy)),true,"Los fastcrop históricos deben migrarse desde el original real");
assert.equal(isBulkOcrReprocessCandidate(doc("previous-complete","complete",previous)),true,"parser_v6 debe poder actualizarse una vez para aplicar la clasificación documental v7");
assert.equal(isBulkOcrReprocessCandidate(doc("compatible-complete","complete",compatibleLegacy)),false,"La revisión parser_v7 legacy equivalente no debe reprocesarse solo por su etiqueta histórica");
assert.equal(isBulkOcrReprocessCandidate(doc("compatible-review","needs_review",compatibleLegacy)),true,"Un OCR compatible pero pendiente sí puede reintentarse por su estado operativo");
assert.equal(isBulkOcrReprocessCandidate(doc("current-review","needs_review",current)),true,"Un OCR actual pendiente puede reintentarse una vez por lote");
assert.equal(isBulkOcrReprocessCandidate(doc("failed","failed",current)),true,"Un fallo operativo puede reintentarse desde el original");
assert.equal(isBulkOcrReprocessCandidate(doc("error","error",current)),true,"Un error operativo puede reintentarse desde el original");
assert.equal(isBulkOcrReprocessCandidate(doc("already-tried","needs_review",current,{bulkReprocessed:true})),false,"Un OCR actual ya reprocesado no puede entrar en bucle automático");
assert.equal(isBulkOcrReprocessCandidate(doc("compatible-already-tried","needs_review",compatibleLegacy,{bulkReprocessed:true})),false,"Un OCR legacy compatible ya reprocesado tampoco puede entrar en bucle");
assert.equal(isBulkOcrReprocessCandidate(doc("current-complete","complete",current)),false,"Un OCR actual completo no debe gastar recursos otra vez");
assert.equal(isBulkOcrReprocessCandidate(doc("manual","manual",legacy)),false,"Una revisión manual nunca puede ser sobrescrita por el lote");
assert.equal(isBulkOcrReprocessCandidate(doc("linked-legacy","complete",legacy,{links:[{id:"movement"}]})),true,"Un legacy vinculado debe poder migrar conservando su asociación");
assert.equal(isBulkOcrReprocessCandidate(doc("linked-current-review","needs_review",current,{links:[{id:"movement"}]})),false,"Un reintento operativo actual vinculado sigue fuera del lote automático");
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
const recoveryBoundary=fs.readFileSync("app/archivo/archive-bulk-ocr-recovery-deferred.tsx","utf8");
const page=fs.readFileSync("app/archivo/page.tsx","utf8");
const canonicalClient=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
assert.ok(wrapper.includes('import("./archive-client")')&&!wrapper.includes("ArchiveBulkOcrRecovery"),"El núcleo activo debe cargarse diferido y no montar un segundo recuperador OCR duplicado");
assert.ok(!wrapper.includes('from "./archive-client"')&&page.includes('from "./archive-client-shell"'),"La página debe montar el shell sin recuperar un import estático del núcleo pesado");
assert.ok(wrapper.includes("archiveRefreshKey")&&wrapper.includes("document.updatedAt"),"router.refresh debe poder remontar el núcleo con datos OCR actualizados");
assert.ok(page.includes("<ArchiveBulkOcrRecoveryDeferred initialCount={pending} shouldCheck={true}/>") ,"Archivo debe comprobar legacy y pendientes en cualquier vista del ciclo documental");
assert.equal((page.match(/<ArchiveBulkOcrRecoveryDeferred/g)||[]).length,1,"Archivo debe mantener una sola superficie de recuperación OCR");
assert.ok(!page.includes('from "./archive-bulk-ocr-recovery"'),"La página no debe cargar el recuperador pesado antes del primer render");
assert.ok(recoveryBoundary.includes('import("./archive-bulk-ocr-recovery")'),"El único recuperador debe seguir siendo el canónico y cargarse a través del boundary diferido");
assert.ok(canonicalClient.includes("recognizeTicketImage(file,worker,onProgress,hint)"),"El núcleo OCR canónico debe seguir intacto en archive-client.tsx");

const client=fs.readFileSync("app/archivo/archive-bulk-ocr-recovery.tsx","utf8");
for(const token of [
  "shouldCheck",
  "if(!shouldCheck){setLoading(false);return;}",
  "async function runBulkRecovery",
  "for(let index=0;index<selected.length;index++)",
  "Originales procesados uno a uno",
  "/api/archive/reprocess-ocr",
  "failed+=1",
])assert.ok(client.includes(token),`Archivo debe integrar recuperación OCR masiva segura: ${token}`);
assert.ok(!/Promise\.all\s*\(\s*selected/.test(client),"El cliente no puede disparar varios OCR de recuperación en paralelo");

const route=fs.readFileSync("app/api/archive/reprocess-ocr/route.ts","utf8");
for(const token of [
  'DISCOVERY_STATES:ArchiveLifecycleState[]=["pending","new","archived"]',
  'financial_app_archive_lifecycle_overview',
  "for(const state of DISCOVERY_STATES)",
  "isLegacyReceiptOcrDocument(detail)",
  "isBulkOcrReprocessCandidate(initial)",
  "download(initial.storagePath)",
  "const latest=await documentDetail",
  "isBulkOcrReprocessCandidate(latest)",
  "buildStoredReceiptPersistence(latest,result)",
  'supabase.rpc("financial_app_archive_update"',
])assert.ok(route.includes(token),`La API de recuperación debe proteger lifecycle completo, original, carreras y escritura: ${token}`);
assert.ok(!route.includes('financial_app_archive_overview'),"La recuperación debe usar el ciclo documental paginado, no cargar la biblioteca completa");
const latestCheckIndex=route.indexOf("const latest=await documentDetail");
const updateCallIndex=route.indexOf('supabase.rpc("financial_app_archive_update"');
assert.ok(latestCheckIndex>=0&&updateCallIndex>=0&&latestCheckIndex<updateCallIndex,"La comprobación de carrera debe ocurrir antes de la llamada RPC que escribe");
assert.ok(route.includes('reason:"changed_during_reprocess"'),"Una revisión manual concurrente debe cancelar la escritura");
assert.ok(route.includes("Los vínculos no se")&&route.includes("legacy pueden conservarlos"),"La ruta debe documentar explícitamente que el reprocesado legacy no modifica asociaciones");

console.log("OCR bulk reprocessing tests OK · legacy complete/archivado actualizable, vínculos preservados, parser_v7 equivalente estable, lote secuencial, sin bucles y carreras aisladas · runtime diferido protegido");
