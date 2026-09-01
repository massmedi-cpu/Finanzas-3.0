import fs from "node:fs";
import {versionAtLeast} from "./lib/version-baseline.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const version=read("lib/app-version.ts");
const pkg=JSON.parse(read("package.json"));
const migration=read("database/FINANCIAL_APP_9.0.0_PENDING_INVOICE_COMMITMENTS.sql");
const release=read("database/FINANCIAL_APP_9.0.0_RELEASE.sql");
const lifecycle=read("database/FINANCIAL_APP_9.0.0_DOCUMENT_LIFECYCLE_CLOSURE.sql");
const storage=read("database/FINANCIAL_APP_9.0.0_DOCUMENT_STORAGE_DURABILITY.sql");
const lifecycleGate=read("database/FINANCIAL_APP_9.0.0_DOCUMENT_LIFECYCLE_RELEASE_GATE.sql");
const archiveClient=read("app/archivo/archive-client.tsx");
const archiveApi=read("app/api/archive/route.ts");
const archiveDetailApi=read("app/api/archive/[id]/route.ts");
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
console.log(`Financial App 9.0.0 release audit OK · baseline preservada por ${currentVersion} · facturas pendientes + ciclo documental canónico protegidos`);
