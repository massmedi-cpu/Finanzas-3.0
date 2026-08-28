import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const route=read("app/api/movements/bulk/route.ts");
const editor=read("app/movimientos/bulk-movement-editor.tsx");
const migration=read("database/FINANCIAL_APP_6.4.4_RETIRE_LEGACY_MOVEMENT_AUTOMATION.sql");
const historical=read("database/FINANCIAL_APP_4.0.0_MOVEMENT_AUTOMATION.sql");
const architecture=read("docs/CANONICAL_ARCHITECTURE.md");

for(const forbidden of ["financial_app_automate_transactions","AUTOMATION_OPERATION","automate-safe"])
  must(!route.includes(forbidden),`La frontera bulk conserva automatización paralela: ${forbidden}`);
must(route.includes('key.startsWith("$")'),"La frontera bulk no bloquea operaciones reservadas $*");
must(route.includes("financial_app_bulk_update_transactions"),"La edición masiva reversible ha desaparecido");
must(route.includes("financial_app_undo_bulk_transaction_batch"),"El undo masivo ha desaparecido");

for(const forbidden of ["Automatización 4.0","Automatizar seguro","automate-safe"])
  must(!editor.includes(forbidden),`El editor conserva UI de automatización retirada: ${forbidden}`);
for(const required of ["Solo se ofrecen operaciones reversibles","otras páginas o antes de cambiar filtros","deshacer el último lote"])
  must(editor.includes(required),`El editor masivo ha perdido claridad de seguridad: ${required}`);

for(const token of [
  "financial_app_6_4_4_legacy_automation_has_history",
  "drop function if exists public.financial_app_automate_transactions(uuid[])",
  "drop function if exists financial_app.automate_transactions_core(uuid[])",
  "drop table if exists financial_app.automation_runs",
  "financial_app_6_4_4_legacy_automation_retirement_failed"
]) must(migration.includes(token),`Migración de retirada 6.4.4 incompleta: ${token}`);

must(historical.includes("financial_app.automate_transactions_core"),"La migración histórica 4.0 debe conservarse para trazabilidad");
for(const token of ["un único matching documental supervisado","automatización masiva 4.0","runtime activo"])
  must(architecture.toLowerCase().includes(token.toLowerCase()),`Arquitectura 6.4.4 incompleta: ${token}`);

if(failures.length){console.error("Financial App 6.4.4 movement runtime audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.4 movement runtime audit OK · motor v4 retirado, edición reversible preservada y selección aclarada");
