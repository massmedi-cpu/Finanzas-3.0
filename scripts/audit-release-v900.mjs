import fs from "node:fs";
import {versionAtLeast} from "./lib/version-baseline.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const migration=read("database/FINANCIAL_APP_9.0.0_PENDING_INVOICE_COMMITMENTS.sql");
const annualMemory=read("database/FINANCIAL_APP_9.0.0_FORECAST_ANNUAL_OBLIGATION_MEMORY.sql");
const driveHydration=read("database/FINANCIAL_APP_9.0.0_DRIVE_DOCUMENT_CONTENT_HYDRATION.sql");
const release=read("database/FINANCIAL_APP_9.0.0_RELEASE.sql");
const lifecycle=read("database/FINANCIAL_APP_9.0.0_DOCUMENT_LIFECYCLE_CLOSURE.sql");
const storage=read("database/FINANCIAL_APP_9.0.0_DOCUMENT_STORAGE_DURABILITY.sql");
const safety=read("database/FINANCIAL_APP_9.0.0_DOCUMENT_Z_SAFETY_HARDENING.sql");
const lifecycleGate=read("database/FINANCIAL_APP_9.0.0_DOCUMENT_LIFECYCLE_RELEASE_GATE.sql");
const archiveClient=read("app/archivo/archive-client.tsx");
const archiveApi=read("app/api/archive/route.ts");
const archiveDetailApi=read("app/api/archive/[id]/route.ts");
const syncApi=read("app/api/sync/route.ts");
const ocrApi=read("app/api/ocr/receipt/route.ts");
const hydrationWorker=read("lib/document/drive-content-hydration.ts");
const serverOcr=read("lib/document/server-receipt-ocr.ts");
const provenance=read("lib/document/receipt-ocr-provenance.ts");
const serverPdf=read("lib/document/server-pdf-text.ts");
const driveSource=read("supabase/functions/financial-app-drive-document-source/index.ts");
const cleanupWorker=read("lib/document/storage-cleanup.ts");
const healthApi=read("app/api/archive/health/route.ts");
const cleanupApi=read("app/api/archive/storage-cleanup/route.ts");
const notes=read("docs/releases/9.0.0.md");
const currentVersion=version.match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1]||"0.0.0";
const current=String(pkg.scripts?.["audit:current"]||"");

must(versionAtLeast(currentVersion,"9.0.0"),"APP_VERSION debe preservar como mínimo la baseline 9.0.0");
must(pkg.version==="3.4.8","La versión técnica npm debe permanecer en 3.4.8");
must(current.includes("audit-pending-invoices-v900.mjs"),"audit:current no ejecuta el gate funcional 9.0.0");
must(current.includes("audit-release-v900.mjs"),"audit:current no ejecuta el cierre 9.0.0");
for(const token of [
  "forecast_calendar_document_commitments_core",
  "forecast_calendar_visible_core(p_start,p_months)",
  "document_match_candidates_rows_core(f.document_id,1)",
  "forecast_event_overrides",
  "forecast_calendar_document_commitments_core(v_start,v_months)",
  "'pendingInvoiceCommitments',true",
  "'sourceDataReadOnly',true"
])must(migration.includes(token),`Migración 9.0.0 incompleta: ${token}`);

for(const token of [
  "forecast_annual_memory_candidate",
  "p_start-2190",
  "<=35",
  "*.12",
  "v_years_observed<2 and not v_strong_signal",
  "v_age_days<=550",
  "v_age_days<=950",
  "v_age_days<=1300",
  "missed_years*.08",
  "cross join lateral financial_app.forecast_annual_memory_candidate",
  "h.estimated_amount",
  "'annual_tax_insurance_history'",
  "'memoryRecovered',h.missed_years>0",
  "'annualObligationMemory',true",
  "'annualMemoryEvidenceDays',2190",
  "'annualMemoryMaxAnchorAgeDays',1300",
  "revoke all on function financial_app.forecast_annual_memory_candidate(uuid,date,date) from public,anon,authenticated,service_role"
])must(annualMemory.includes(token),`Memoria anual 9.0.0 incompleta: ${token}`);
must(!/\b(update|delete|insert)\s+financial_app\.transactions\b/i.test(annualMemory),"La memoria anual no puede mutar movimientos bancarios");
must(annualMemory.includes("forecast_calendar_visible_core(date,integer)"),"La memoria anual debe extender el calendario canónico, no crear un circuito paralelo");
must(annualMemory.includes("forecast_annual_memory_target_patch_not_applied")&&annualMemory.includes("forecast_annual_memory_unexpected_amount_contract"),"La migración debe fallar cerrada si cambia el contrato que está extendiendo");

for(const token of [
  "document_content_hydration_queue",
  "financial_app_prepare_drive_document_hydration",
  "financial_app_drive_document_hydration_pending",
  "financial_app_drive_document_hydration_source",
  "financial_app_drive_document_hydration_fail",
  "financial_app_complete_drive_document_hydration",
  "financial_app_finalize_document_links_after_hydration",
  "source_too_large",
  "processing_timeout_limit",
  "q.attempts<3",
  "interval '10 minutes'",
  "sourceDataReadOnly",
  "d.ocr_status in('complete','manual','not_required')",
  "revoke all on table financial_app.document_content_hydration_queue from public,anon,authenticated",
  "grant execute on function public.financial_app_drive_document_hydration_source(uuid) to service_role"
])must(driveHydration.includes(token),`Hidratación Drive 9.0.0 incompleta: ${token}`);
must(!/\b(update|delete|insert)\s+financial_app\.transactions\b/i.test(driveHydration),"La hidratación documental no puede mutar movimientos bancarios");
must(!driveHydration.includes("grant execute on function public.financial_app_drive_document_hydration_source(uuid) to authenticated"),"El puente interno de origen Drive no puede exponerse directamente a usuarios autenticados");
for(const status of ["'pending'","'processing'","'needs_review'"])
  must(!driveHydration.includes(`d.ocr_status in('complete','manual','not_required',${status})`),`Auto-link no puede admitir OCR no validado: ${status}`);

for(const token of ["processDriveDocumentHydration","maxDuration=60","contentHydration","drive_content_hydration_unavailable"])
  must(syncApi.includes(token),`Sync no integra hidratación documental de forma tolerante: ${token}`);
for(const token of ["MAX_BATCH=2","BUDGET_MS=32_000","financial_app_prepare_drive_document_hydration","financial_app_drive_document_hydration_pending","financial_app_complete_drive_document_hydration","financial_app_finalize_document_links_after_hydration","drive_auto_pdf_text_v1","drive_auto_image_tesseract_v1","agreement.compared>=2","confidence??0)>=85"])
  must(hydrationWorker.includes(token),`Worker de hidratación Drive incompleto: ${token}`);
must(!hydrationWorker.includes("financial_app.transactions"),"El worker de hidratación no puede tocar directamente movimientos");
for(const token of ["recognizeServerReceiptImage","ServerReceiptOcrError","SERVER_RECEIPT_OCR_RUNTIME","OCR_LANGUAGE_ROOT","queueTimeoutMs"])
  must(serverOcr.includes(token),`OCR de servidor compartido incompleto: ${token}`);
must(provenance.includes('SERVER_RECEIPT_OCR_RUNTIME = "server-tesseract-7"')&&provenance.includes('SERVER_RECEIPT_OCR_MODEL = "spa.traineddata"'),"La procedencia canónica debe fijar runtime Tesseract 7 y modelo español");
must(ocrApi.includes("recognizeServerReceiptImage")&&!ocrApi.includes("createWorker"),"El endpoint OCR debe reutilizar el motor de servidor en vez de duplicarlo");
for(const token of ["pdfjs-dist/legacy/build/pdf.mjs","MAX_PDF_PAGES=16","MIN_USEFUL_TEXT=40","getTextContent"])
  must(serverPdf.includes(token),`Lector PDF de hidratación incompleto: ${token}`);
for(const token of ["drive.readonly","financial_app_drive_document_hydration_source","MAX_SOURCE_BYTES=12*1024*1024","alt=media","supportsAllDrives=true","requireAllowedUser","cache-control\":\"private, no-store"])
  must(driveSource.includes(token),`Puente Drive de solo lectura incompleto: ${token}`);
must(!/method:\s*["'](?:PUT|PATCH|DELETE)["']/i.test(driveSource),"El puente Drive no puede escribir ni borrar en Google Drive");

for(const token of [
  "financial_app_9_0_0_requires_8_0_0_baseline",
  "financial_app_9_0_0_security_contract_missing",
  "financial_app_9_0_0_calendar_grants_invalid",
  "financial_app_9_0_0_document_forecast_contract_missing",
  "financial_app_9_0_0_canonical_liquidity_dependency_missing",
  "financial_app_9_0_0_source_data_mutation_detected",
  "'app_version',to_jsonb('9.0.0'::text)",
  "'target_version',to_jsonb('9.0.0'::text)",
  "financial_app_9_0_0_metadata_alignment_failed",
  "financial_app_9_0_0_manifest_alignment_failed"
])must(release.includes(token),`Release 9.0.0 incompleto: ${token}`);

for(const token of [
  "archive_document_pending_reasons_core",
  "document_has_match_candidate_core",
  "'ocr_processing'",
  "'ocr_needs_review'",
  "'movement_match_pending'",
  "'lifecycleState'",
  "'pendingReasons'",
  "perform financial_app.archive_archive_core(p_document_id)",
  "usesCanonicalLifecycleState"
])must(lifecycle.includes(token),`Cierre documental 9.0.0 incompleto: ${token}`);

for(const token of [
  "document_deletion_tombstones",
  "document_storage_cleanup_queue",
  "duplicate_replaced",
  "orphan_reconciliation",
  "archive_reuse_duplicate_core",
  "document_storage_cleanup_reconcile_core",
  "document_lifecycle_health_core"
])must(storage.includes(token),`Durabilidad documental 9.0.0 incompleta: ${token}`);

for(const token of [
  "not state.linked and financial_app.document_has_match_candidate_core",
  "o.owner_id=v_uid::text",
  "o.created_at<=now()-interval '15 minutes'",
  "q.attempts<5",
  "q.last_attempt_at<=now()-interval '10 minutes'",
  "'orphanGraceMinutes',15",
  "'cleanupRetryLimit',5",
  "'cleanupRetryBackoffMinutes',10"
])must(safety.includes(token),`Endurecimiento documental 9.0.0 incompleto: ${token}`);

for(const token of [
  "documentLifecycleReady",
  "documentStorageCleanupReady",
  "archiveDetailParityReady",
  "archiveReviewGateReady",
  "document_storage_cleanup_queue",
  "financial_app_document_storage_cleanup_reconcile"
])must(lifecycleGate.includes(token),`Release gate documental 9.0.0 incompleto: ${token}`);

must(archiveClient.includes('return document.lifecycleState==="pending"'),"Archivo vuelve a decidir el estado pendiente con una heurística local");
must(!archiveClient.includes('document.links.length===0&&document.suggestions.length>0'),"Archivo conserva la heurística local antigua de revisión");
must(archiveApi.includes("processDocumentStorageCleanup(supabase,25)"),"El listado de Archivo no ejecuta reconciliación/limpieza durable");
must(!archiveApi.includes("previousStoragePath"),"La sustitución de duplicados conserva limpieza manual no durable");
must(archiveDetailApi.includes("processDocumentStorageCleanup(supabase,25)"),"El borrado documental no ejecuta la cola durable");
must(!archiveDetailApi.includes("remove([detail.data.storagePath])"),"El borrado documental conserva limpieza directa no durable");
for(const token of [
  "financial_app_document_storage_cleanup_reconcile",
  "financial_app_document_storage_cleanup_pending",
  "financial_app_document_storage_cleanup_mark",
  "financial_app_document_storage_cleanup_count"
])must(cleanupWorker.includes(token),`Worker de limpieza documental incompleto: ${token}`);
must(healthApi.includes("financial_app_document_lifecycle_health"),"No existe autodiagnóstico autenticado del ciclo documental");
must(!healthApi.includes("processDocumentStorageCleanup"),"El health check vuelve a mutar Storage en una petición GET");
must(cleanupApi.includes("processDocumentStorageCleanup"),"No existe endpoint autenticado de mantenimiento documental");

for(const token of [
  "Financial App 9.0.0",
  "Facturas pendientes inteligentes",
  "45 días",
  "7 días",
  "matcher",
  "forecast_calendar_visible_core",
  "forecast_liquidity_core",
  "descartable",
  "solo lectura",
  "3.4.8"
])must(notes.toLowerCase().includes(token.toLowerCase()),`Notas 9.0.0 incompletas: ${token}`);

if(failures.length){console.error("Financial App 9.0.0 release audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Financial App 9.0.0 release audit OK · baseline preservada por ${currentVersion} · facturas pendientes + memoria anual + hidratación Drive + ciclo documental canónico protegidos`);
