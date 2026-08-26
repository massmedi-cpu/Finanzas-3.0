import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const migration=read("database/FINANCIAL_APP_3.9.0_RECONCILIATION_WORKBENCH.sql");
for(const token of [
  "reconciliation_decisions","financial_app_reconciliation_queue","financial_app_set_reconciliation_status","financial_app_reconcile_pair_safe",
  "changed_since_open","candidate_changed_since_open","reconciliation_reason_required","p_expected_updated_at","manual_exact",
  "revoke all on function public.financial_app_reconciliation_queue","grant execute on function public.financial_app_reconciliation_queue"
])must(migration.includes(token),`Migración 3.9.0 sin garantía: ${token}`);

const api=read("app/api/reconciliation/route.ts");
for(const token of ["getAuthorizedClient","apiFailure","set_status","financial_app_set_reconciliation_status","financial_app_reconcile_pair_safe","expectedUpdatedAt","candidateExpectedUpdatedAt"])
  must(api.includes(token),`API de conciliación sin garantía: ${token}`);

const client=read("app/movimientos/conciliacion/reconciliation-workbench.tsx");
for(const token of ["Resolver movimientos","Contrapartidas exactas","Marcar conciliado","No conciliado","Restaurar origen","changed_since_open","candidate_changed_since_open","/api/reconciliation"])
  must(client.includes(token),`Workbench sin garantía: ${token}`);

const page=read("app/movimientos/conciliacion/page.tsx");
for(const token of ["getReconciliationQueue","ReconciliationWorkbench","decisiones manuales quedan auditadas"])
  must(page.includes(token),`Página de conciliación sin garantía: ${token}`);

const model=read("lib/financial/reconciliation.ts");
for(const token of ["ReconciliationCandidate","ReconciliationCase","ReconciliationQueue","financial_app_reconciliation_queue"])
  must(model.includes(token),`Modelo de conciliación sin garantía: ${token}`);

const boundary=read("lib/api/response.ts");
for(const token of ["changed_since_open","candidate_changed_since_open","reconciliation_reason_required","amounts_do_not_offset","pair_already_reconciled"])
  must(boundary.includes(token),`Frontera API sin código seguro: ${token}`);

if(failures.length){console.error("Financial App 3.9.0 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 3.9.0 audit OK · cola individual, decisiones auditadas, pairing exacto y control de concurrencia protegidos");
