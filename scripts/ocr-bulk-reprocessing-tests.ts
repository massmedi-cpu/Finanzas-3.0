import assert from "node:assert/strict";
import fs from "node:fs";
import { bulkOcrReprocessPlan, isBulkOcrReprocessCandidate, isLegacyReceiptOcrDocument, BULK_OCR_REPROCESS_LIMIT } from "../lib/document/ocr-bulk-reprocess-policy";
import { RECEIPT_OCR_METHOD_PREFIX } from "../lib/document/receipt-ocr-revision";

const current=`${RECEIPT_OCR_METHOD_PREFIX}server_tesseract_7_geometry`;
const tesseractParserV7="image_ocr_receipt_v501:server_tesseract_7_geometry_v1:parser_v7:server_tesseract_7_geometry";
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
assert.equal(isLegacyReceiptOcrDocument(doc("tesseract-v7", "needs_review", tesseractParserV7)),false,"Cambiar solo el parser no convierte el OCR visual Tesseract 7 en legacy");
assert.equal(isBulkOcrReprocessCandidate(doc("legacy-complete","complete",legacy)),true,"Un OCR realmente legado complete debe poder actualizar motor/parser aunque no esté Pending");
assert.equal(isBulkOcrReprocessCandidate(doc("fastcrop-complete","complete",fastcropLegacy)),true,"Los fastcrop históricos deben migrarse desde el original real");
assert.equal(isBulkOcrReprocessCandidate(doc("previous-complete","complete",previous)),true,"parser_v6 debe poder actualizarse desde una procedencia visual realmente antigua");
assert.equal(isBulkOcrReprocessCandidate(doc("compatible-complete","complete",compatibleLegacy)),false,"Una lectura compatible y completa no debe releerse solo por su etiqueta histórica");
assert.equal(isBulkOcrReprocessCandidate(doc("compatible-review","needs_review",compatibleLegacy)),true,"Un OCR compatible pero pendiente puede recuperar metadatos o reintentarse por su estado operativo");
assert.equal(isBulkOcrReprocessCandidate(doc("tesseract-v7-review","needs_review",tesseractParserV7)),true,"Tesseract 7 parser_v7 pendiente debe entrar para reparseo barato sin clasificarse como legacy");
assert.equal(isBulkOcrReprocessCandidate(doc("current-review","needs_review",current)),true,"Un OCR actual pendiente puede reintentarse una vez por lote si el parser ya no puede mejorarlo");
assert.equal(isBulkOcrReprocessCandidate(doc("failed","failed",current)),true,"Un fallo operativo puede reintentarse desde el original");
assert.equal(isBulkOcrReprocessCandidate(doc("error","error",current)),true,"Un error operativo puede reintentarse desde el original");
assert.equal(isBulkOcrReprocessCandidate(doc("already-tried","needs_review",current,{bulkReprocessed:true})),false,"Un OCR actual ya reprocesado no puede entrar en bucle automático");
assert.equal(isBulkOcrReprocessCandidate(doc("compatible-already-tried","needs_review",compatibleLegacy,{bulkReprocessed:true})),false,"Un OCR compatible ya actualizado tampoco puede entrar en bucle");
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
const lifecycleClient=fs.readFileSync("app/archivo/archive-lifecycle-client.tsx","utf8");
const canonicalClient=fs.readFileSync("app/archivo/archive-client.tsx","utf8");
const archivePayloadContract=fs.readFileSync("database/FINANCIAL_APP_9.0.0_ARCHIVE_STORAGE_PROVIDER_CONTRACT.sql","utf8");
assert.ok(wrapper.includes('import("./archive-client")')&&!wrapper.includes("ArchiveBulkOcrRecovery"),"El núcleo activo debe cargarse diferido y no montar un segundo recuperador OCR duplicado");
assert.ok(!wrapper.includes('from "./archive-client"')&&page.includes('from "./archive-client-shell"'),"La página debe montar el shell sin recuperar un import estático del núcleo pesado");
assert.ok(wrapper.includes("archiveRefreshKey")&&wrapper.includes("document.updatedAt"),"router.refresh debe poder remontar el núcleo con datos OCR actualizados");
assert.ok(page.includes("<ArchiveBulkOcrRecoveryDeferred initialCount={pending} shouldCheck={true}/>") ,"Archivo debe comprobar legacy y pendientes en cualquier vista del ciclo documental");
assert.equal((page.match(/<ArchiveBulkOcrRecoveryDeferred/g)||[]).length,1,"Archivo debe mantener una sola superficie de recuperación OCR masiva");
assert.ok(!page.includes('from "./archive-bulk-ocr-recovery"'),"La página no debe cargar el recuperador pesado antes del primer render");
assert.ok(recoveryBoundary.includes('import("./archive-bulk-ocr-recovery")'),"El recuperador masivo debe seguir siendo el canónico y cargarse a través del boundary diferido");
assert.ok(canonicalClient.includes("recognizeTicketImage(file,worker,onProgress,hint)"),"El núcleo OCR canónico debe seguir intacto en archive-client.tsx");
assert.ok(lifecycleClient.includes('action="/api/archive/reprocess-ocr"')&&lifecycleClient.includes('method="post"'),"Cada pendiente compatible debe disponer de un fallback HTML nativo que no dependa de JavaScript");
assert.ok(lifecycleClient.includes('name="documentId"')&&lifecycleClient.includes('Reprocesar OCR'),"El fallback nativo debe enviar de forma explícita el documento seleccionado");
assert.ok(archivePayloadContract.includes("'storageProvider',d.storage_provider"),"El payload documental debe exponer storageProvider para que la recuperación distinga originales privados");
assert.ok(archivePayloadContract.includes("'storageUrl',d.storage_url"),"El payload documental debe conservar el contrato storageUrl junto al proveedor canónico");

const client=fs.readFileSync("app/archivo/archive-bulk-ocr-recovery.tsx","utf8");
for(const token of [
  "shouldCheck",
  "if(!shouldCheck){setLoading(false);return;}",
  "async function runBulkRecovery",
  "for(let index=0;index<selected.length;index++)",
  "Documentos procesados uno a uno",
  "/api/archive/reprocess-ocr",
  "failed+=1",
])assert.ok(client.includes(token),`Archivo debe integrar recuperación documental segura: ${token}`);
assert.ok(!/Promise\.all\s*\(\s*selected/.test(client),"El cliente no puede disparar varias recuperaciones en paralelo");

const route=fs.readFileSync("app/api/archive/reprocess-ocr/route.ts","utf8");
for(const token of [
  'DISCOVERY_STATES:ArchiveLifecycleState[]=["pending","new","archived"]',
  'financial_app_archive_lifecycle_overview',
  "for(const state of DISCOVERY_STATES)",
  "isLegacyReceiptOcrDocument(detail)",
  "isBulkOcrReprocessCandidate(initial)",
  'const previewReparse=reparseStoredReceiptMetadata(initial,"preview")',
  'return respond(recoveryResponse(documentId,reparsed.persistence,reparsed.fieldChanges,"metadata_reparse"))',
  "download(initial.storagePath)",
  "buildStoredReceiptPersistence(latest,result)",
  'return respond(recoveryResponse(documentId,persistence,fieldChanges,"full_ocr"))',
  'supabase.rpc("financial_app_archive_update"',
  "request.formData()",
  "NextResponse.redirect",
  "safeArchiveReturnTo",
])assert.ok(route.includes(token),`La API de recuperación debe proteger lifecycle, reparseo, original, carreras, formulario nativo y escritura: ${token}`);
assert.ok(!route.includes('financial_app_archive_overview'),"La recuperación debe usar el ciclo documental paginado, no cargar la biblioteca completa");
assert.ok(route.indexOf('const previewReparse=reparseStoredReceiptMetadata(initial,"preview")')<route.indexOf('download(initial.storagePath)'),"El parser almacenado debe intentarse antes de descargar el original");
const parserRace=route.indexOf('const reparsed=reparseStoredReceiptMetadata(latest)');
const parserWrite=route.indexOf('persistRecovery(supabase,documentId,latest,reparsed.persistence)');
assert.ok(parserRace>=0&&parserWrite>parserRace,"El reparseo debe releer el estado antes de escribir");
const fullOcrStart=route.indexOf('const stored=await supabase.storage.from("financial-app-documents").download');
const fullOcrRace=route.indexOf('const latest=await documentDetail(supabase,documentId)',fullOcrStart);
const fullOcrWrite=route.indexOf('persistRecovery(supabase,documentId,latest,persistence)',fullOcrStart);
assert.ok(fullOcrStart>=0&&fullOcrRace>fullOcrStart&&fullOcrWrite>fullOcrRace,"El OCR completo conserva la comprobación de carrera antes de escribir");
assert.ok(route.includes('reason:"changed_during_reprocess"')&&route.includes('reason:"changed_during_reparse"'),"Una revisión manual concurrente debe cancelar cualquiera de las dos escrituras");
assert.ok(route.includes("Los vínculos no se")&&route.includes("legacy pueden conservarlos"),"La ruta debe documentar explícitamente que el reprocesado legacy no modifica asociaciones");

console.log("OCR bulk reprocessing tests OK · payload de almacenamiento completo, parser_v8 reutiliza evidencia v7, OCR visual solo cuando hace falta, lote secuencial, fallback nativo, sin bucles y carreras aisladas");
