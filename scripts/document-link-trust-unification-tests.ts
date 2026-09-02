import fs from "node:fs";

const read=(path:string)=>fs.readFileSync(path,"utf8");
const migration=read("database/FINANCIAL_APP_9.0.0_DOCUMENT_LINK_TRUST_UNIFICATION.sql");
const route=read("app/api/archive/[id]/links/route.ts");
const client=read("app/movimientos/movement-documents.tsx");
const types=read("lib/financial/movements.ts");
const failures:string[]=[];
const must=(condition:boolean,message:string)=>{if(!condition)failures.push(message)};

for(const status of ["pending","processing","needs_review","failed","error"]){
  must(migration.includes(`'${status}'`),`El matcher de Movimientos no bloquea OCR ${status}`);
}
must(migration.includes("cross join lateral financial_app.document_match_candidates_rows_core"),"Movimientos no reutiliza el matcher documental canónico");
must(migration.includes("'matchingEngine','canonical_supervised'"),"La respuesta no declara el motor canónico supervisado");
must(migration.includes("'ocrReadinessRequiredForSuggestions',true"),"La respuesta no declara la frontera de confianza OCR");
must(migration.includes("'ocrStatus',d.ocr_status")&&migration.includes("'pendingReasons'"),"Los documentos vinculados no exponen su confianza OCR");
must(!migration.includes("amount_score+date_score+merchant_score"),"Sigue activo el scorer documental duplicado dentro de Movimientos");

for(const token of [
  "archive_restore_and_link_calibrated_core",
  "perform financial_app.archive_restore_core(p_document_id)",
  "return financial_app.archive_link_calibrated_core(p_document_id,p_source_id)",
  "financial_app_archive_restore_and_link_calibrated",
  "revoke all on function public.financial_app_archive_restore_and_link_calibrated(uuid,text) from public,anon",
  "grant execute on function public.financial_app_archive_restore_and_link_calibrated(uuid,text) to authenticated,service_role"
])must(migration.includes(token),`Restaurar+vincular no es atómico/seguro: ${token}`);

for(const token of [
  "acknowledgeUnreviewed",
  "restoreArchived",
  "document_ocr_unreviewed",
  "archived_document_requires_restore",
  "financial_app_archive_restore_and_link_calibrated",
  "linkedWithUnreviewedOcr"
])must(route.includes(token),`La API de vínculo no protege ${token}`);
must(route.indexOf("updatedDocument(supabase,id)")<route.indexOf("financial_app_archive_link_calibrated"),"La API debe leer estado OCR/archivo antes de mutar");

for(const token of [
  "trustedOcrStatuses",
  "unreviewedOcrStatuses",
  "trustedSuggestions",
  "datos OCR provisionales",
  "Vincular · OCR pendiente",
  "Restaurar y vincular",
  "acknowledgeUnreviewed",
  "restoreArchived",
  "includeArchived",
  "matcher canónico supervisado"
])must(client.includes(token),`La UX de relación documental no protege ${token}`);
must(client.includes("filter(document=>ocrMetadataTrusted(document.ocrStatus))"),"La UI debe rechazar defensivamente sugerencias con OCR no resuelto");
must(client.includes("El OCR sigue pendiente de revisión; sus datos no se han dado por confirmados"),"La UI no separa confianza de relación y confianza OCR");

for(const token of ["ocrStatus?:string|null","pendingReasons?:string[]","matchingEngine?:string","ocrReadinessRequiredForSuggestions?:boolean"])
  must(types.includes(token),`Falta contrato tipado de confianza documental: ${token}`);

if(failures.length){
  console.error("Document link trust unification tests FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Document link trust unification tests OK · matcher canónico único, OCR provisional explícito, enlace manual consciente y restauración histórica atómica protegidos");
