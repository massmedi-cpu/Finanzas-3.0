import fs from "node:fs";

const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};
const script=fs.readFileSync("scripts/preflight-supabase-contract.mjs","utf8");
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
const migration=fs.readFileSync("database/FINANCIAL_APP_3.8.1_RELEASE_PREFLIGHT_INVOKER.sql","utf8");
const lower=migration.toLowerCase();
const hardening=fs.readFileSync("database/FINANCIAL_APP_9.0.0_SEARCH_PREFLIGHT_HARDENING.sql","utf8");
const hardeningLower=hardening.toLowerCase();

for(const token of [
  "FALLBACK_SUPABASE_URL",
  "FALLBACK_SUPABASE_PUBLISHABLE_KEY",
  "financial_app_release_preflight",
  "p_expected_version",
  "p_required_functions",
  "payload.appVersion",
  "payload.targetVersion",
  "RPCs ausentes",
  "baselineVersion",
  "acceptedVersions",
  "--exact"
]) must(script.includes(token),`Preflight ha perdido la garantía: ${token}`);

must(!/service[_-]?role/i.test(script),"El preflight de build no puede depender de service_role");
const prebuild=String(pkg.scripts?.prebuild||"");
const release=String(pkg.scripts?.["audit:release"]||"");
const livePreflight=String(pkg.scripts?.["preflight:supabase"]||"");
const exactPreflight=String(pkg.scripts?.["preflight:supabase:release"]||"");
must(prebuild.includes("audit:release")&&release.includes("audit-release-preflight.mjs"),"La auditoría del preflight debe ejecutarse en cada build mediante audit:release");
must(prebuild.includes("audit:release")&&release.includes("preflight:supabase")&&livePreflight.includes("preflight-supabase-contract.mjs"),"El preflight vivo de candidato debe ejecutarse en cada build mediante audit:release");
must(exactPreflight.includes("preflight-supabase-contract.mjs")&&exactPreflight.includes("--exact"),"Debe existir un preflight Supabase exacto reservado al cierre de publicación");

for(const token of [
  "create table if not exists public.financial_app_release_manifest",
  "alter table public.financial_app_release_manifest enable row level security",
  "grant select on table public.financial_app_release_manifest to anon, authenticated, service_role",
  "create policy financial_app_release_manifest_read",
  "create or replace function financial_app.sync_release_manifest_core()",
  "revoke all on function financial_app.sync_release_manifest_core() from public, anon, authenticated",
  "create trigger financial_app_sync_release_manifest",
  "create or replace function public.financial_app_release_preflight",
  "security invoker",
  "from public.financial_app_release_manifest",
  "from pg_proc p",
  "grant execute on function public.financial_app_release_preflight(text,text[]) to anon, authenticated, service_role"
]) must(lower.includes(token.toLowerCase()),`Migración invoker incompleta: ${token}`);

const publicFn=migration.slice(migration.toLowerCase().lastIndexOf("create or replace function public.financial_app_release_preflight"));
must(!/security\s+definer/i.test(publicFn),"financial_app_release_preflight no puede volver a SECURITY DEFINER");
must(!publicFn.includes("financial_app.app_meta"),"El RPC público no puede leer app_meta privado directamente");

for(const token of [
  "add column if not exists search_vector tsvector",
  "create or replace function financial_app.refresh_transaction_search_vector()",
  "security invoker",
  "create trigger transactions_refresh_search_vector",
  "using gin(search_vector)",
  "t.search_vector @@ websearch_to_tsquery('simple',v_search)",
  "financial_app_search_hardening_unknown_movements_contract",
  "search_vector_ready boolean not null default false",
  "forecast_document_candidate_ready boolean not null default false",
  "create or replace function public.financial_app_release_preflight",
  "set search_path to 'pg_catalog','public'",
  "and v_search_ready",
  "and v_forecast_document_ready",
  "grant execute on function public.financial_app_release_preflight(text,text[]) to anon,authenticated,service_role"
]) must(hardeningLower.includes(token.toLowerCase()),`Hardening 9.0.0 incompleto: ${token}`);

must(!/security\s+definer/i.test(hardening),"El hardening 9.0.0 no puede introducir SECURITY DEFINER");
const hardeningPublicStart=hardeningLower.lastIndexOf("create or replace function public.financial_app_release_preflight");
const hardeningPublicEnd=hardeningLower.indexOf("revoke all on function public.financial_app_release_preflight",hardeningPublicStart);
const hardeningPublicFn=hardening.slice(hardeningPublicStart,hardeningPublicEnd);
must(hardeningPublicStart>=0&&hardeningPublicEnd>hardeningPublicStart,"No se puede aislar el preflight público endurecido");
must(!hardeningPublicFn.includes("financial_app.transactions"),"El preflight público endurecido no puede inspeccionar transactions privado");
must(!hardeningPublicFn.includes("financial_app.app_meta"),"El preflight público endurecido no puede inspeccionar app_meta privado");
must(hardeningPublicFn.includes("public.financial_app_release_manifest"),"El preflight endurecido debe leer únicamente readiness público saneado");

if(failures.length){
  console.error("Financial App release preflight audit FAILED");
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Financial App release preflight audit OK · candidato compatible con baseline, búsqueda reproducible, readiness público, invoker mínimo y sin service_role en build");
