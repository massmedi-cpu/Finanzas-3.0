import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const migrationPath="database/FINANCIAL_APP_6.1.0_MATCHING_CALIBRATION.sql";
must(fs.existsSync(migrationPath),"Falta la migración de calibración anónima 6.1");
const migration=fs.existsSync(migrationPath)?read(migrationPath):"";
const api=read("app/api/archive/[id]/links/route.ts");
const loader=read("lib/financial/document-matching-calibration.ts");
const panel=read("app/control/document-matching-calibration-panel.tsx");
const page=read("app/control/page.tsx");
const css=read("app/control/document-matching-calibration.css");
const layout=read("app/control/layout.tsx");

for(const token of [
  "document_matching_calibration_events","archive_link_calibrated_core","archive_unlink_calibrated_core",
  "document_matching_calibration_core","financial_app_archive_link_calibrated","financial_app_archive_unlink_calibrated",
  "financial_app_document_matching_calibration","chosen_was_top","top_score_band","top_margin_band","top_auto_eligible",
  "autoEligibleRejected","thresholdsAreObservedNotAutoAdjusted","noFinancialValuesStored","noEntityIdsStored",
]) must(migration.includes(token),`Calibración 6.1 incompleta: ${token}`);

must(!migration.includes("create or replace function financial_app.archive_link_core"),"La calibración 6.1 no puede sustituir archive_link_core de producción 6.0.1");
must(!migration.includes("create or replace function financial_app.archive_unlink_core"),"La calibración 6.1 no puede sustituir archive_unlink_core de producción 6.0.1");
for(const token of [
  "grant execute on function public.financial_app_archive_link_calibrated(uuid,text) to authenticated",
  "grant execute on function public.financial_app_archive_unlink_calibrated(uuid,text) to authenticated",
  "grant execute on function public.financial_app_document_matching_calibration(integer) to authenticated",
]) must(migration.includes(token),`Frontera authenticated incompleta: ${token}`);
for(const token of [
  "revoke all on function public.financial_app_archive_link_calibrated(uuid,text) from public,anon",
  "revoke all on function public.financial_app_archive_unlink_calibrated(uuid,text) from public,anon",
  "revoke all on function public.financial_app_document_matching_calibration(integer) from public,anon",
]) must(migration.includes(token),`Frontera anon incompleta: ${token}`);

const tableDefinition=migration.match(/create table if not exists financial_app\.document_matching_calibration_events\(([\s\S]*?)\);/)?.[1]||"";
must(Boolean(tableDefinition),"No se puede auditar la tabla de calibración");
const columnNames=[...tableDefinition.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+/gmi)].map(match=>match[1]);
for(const forbidden of ["document_id","transaction_id","source_id","amount","merchant","concept","counterparty","file_name","storage_url"])
  must(!columnNames.includes(forbidden),`La calibración anónima no puede almacenar ${forbidden}`);
for(const allowedDerived of ["top_merchant_match","top_auto_eligible","top_score_band","top_margin_band"])
  must(columnNames.includes(allowedDerived),`Falta señal derivada anónima de calibración: ${allowedDerived}`);

for(const token of [
  "document_match_candidates_rows_core(p_document_id,20)",
  "v_chosen_rank=1",
  "v_existing_origin is distinct from 'manual'",
  "engine_version,decision,association_origin",
  "financial_app.current_app_version(),'accepted','manual'",
  "financial_app.current_app_version(),'reverted',v_origin",
]) must(migration.includes(token),`Feedback atómico incompleto: ${token}`);
must(migration.includes("v_linked:=financial_app.archive_link_core(p_document_id,p_source_id)"),"El wrapper calibrado debe reutilizar el link canónico existente");
must(migration.includes("v_unlinked:=financial_app.archive_unlink_core(p_document_id,p_source_id)"),"El wrapper calibrado debe reutilizar el unlink canónico existente");

for(const token of ["financial_app_archive_link_calibrated","financial_app_archive_unlink_calibrated"])
  must(api.includes(token),`La API 6.1 no usa el wrapper calibrado: ${token}`);
must(!api.includes('supabase.rpc("financial_app_archive_link"')&&!api.includes('supabase.rpc("financial_app_archive_unlink"'),"La API 6.1 no puede saltarse la calibración usando los RPC antiguos");
for(const token of ["MatchingCalibration","autoEligibleRejected","topChoiceRate","financial_app_document_matching_calibration","thresholdsAreObservedNotAutoAdjusted"])
  must(loader.includes(token),`Loader de calibración incompleto: ${token}`);
for(const token of ["CALIBRACIÓN REAL","Top elegido","Alternativa / externa","Precisión de autoelegibles","no se modifican automáticamente","no guarda importes"])
  must(panel.toLowerCase().includes(token.toLowerCase()),`Panel de calibración incompleto: ${token}`);
for(const token of ["getDocumentMatchingCalibration","DocumentMatchingCalibrationPanel","calibration"])
  must(page.includes(token),`Centro de control no integra calibración real: ${token}`);
for(const token of [".document-matching-calibration{",".document-calibration-summary{",".document-calibration-safety{","font-size:14px","min-height:44px"])
  must(css.includes(token),`Estilos de calibración incompletos: ${token}`);
must(layout.includes('import "./document-matching-calibration.css";'),"Centro de control debe cargar la hoja propietaria de calibración");

const outsideDefinitions=migration.replace(/create or replace function[\s\S]*?\$function\$;/gi,"");
for(const forbiddenCall of [
  /\b(?:select|perform)\s+financial_app\.archive_link_calibrated_core\s*\(/i,
  /\b(?:select|perform)\s+financial_app\.archive_unlink_calibrated_core\s*\(/i,
]) must(!forbiddenCall.test(outsideDefinitions),"La migración no puede ejecutar asociaciones al instalar la calibración");

if(failures.length){console.error("Document matching calibration v6.1 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Document matching calibration v6.1 audit OK · feedback atómico, anónimo, compatible con 6.0.1 y sin autoajuste de umbrales");
