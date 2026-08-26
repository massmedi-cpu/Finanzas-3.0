import fs from "node:fs";

const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};
const script=fs.readFileSync("scripts/preflight-supabase-contract.mjs","utf8");
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
const migration=fs.readFileSync("database/FINANCIAL_APP_RELEASE_PREFLIGHT.sql","utf8");

for(const token of [
  "FALLBACK_SUPABASE_URL",
  "FALLBACK_SUPABASE_PUBLISHABLE_KEY",
  "financial_app_release_preflight",
  "p_expected_version",
  "p_required_functions",
  "payload.appVersion",
  "payload.targetVersion",
  "RPCs ausentes"
]) must(script.includes(token),`Preflight ha perdido la garantía: ${token}`);

must(String(pkg.scripts?.prebuild||"").startsWith("node scripts/preflight-supabase-contract.mjs"),"El preflight debe ejecutarse antes de cualquier build");

for(const token of [
  "create or replace function public.financial_app_release_preflight",
  "from pg_proc p",
  "from financial_app.app_meta",
  "grant execute on function public.financial_app_release_preflight(text,text[]) to anon, authenticated, service_role"
]) must(migration.toLowerCase().includes(token.toLowerCase()),`Migración del preflight incompleta: ${token}`);

if(failures.length){console.error("Financial App release preflight audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App release preflight audit OK · versión y RPCs vivos bloquean builds incompatibles");
