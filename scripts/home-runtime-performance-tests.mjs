import assert from "node:assert/strict";
import fs from "node:fs";

const sql=fs.readFileSync("database/FINANCIAL_APP_9.0.0_HOME_RUNTIME_OPTIMIZATION.sql","utf8");
const fastSql=fs.readFileSync("database/FINANCIAL_APP_9.0.0_RECONCILIATION_STATUS_FAST_PATH.sql","utf8");
const page=fs.readFileSync("app/page.tsx","utf8");
const sections=fs.readFileSync("app/home-sections.tsx","utf8");
const accounts=fs.readFileSync("lib/financial/accounts.ts","utf8");
const pulse=fs.readFileSync("lib/financial/home-pulse.ts","utf8");

assert.ok(sql.includes("financial_app.effective_reconciliation_status(t) as reconciliation_status"),"La migración histórica de Home debe documentar el punto de partida medido");
assert.ok(sql.includes("'reconciliation',jsonb_build_object("),"Home pulse debe devolver el resumen de conciliación integrado");
assert.ok(!sql.includes("reconciliation_summary_core()"),"Home pulse no debe lanzar una segunda agregación completa de conciliación");

assert.ok(fastSql.includes("reconciliation_status_effective text"),"Debe existir un estado de conciliación generado por PostgreSQL");
assert.ok(fastSql.includes("generated always as"),"El estado rápido debe derivarse automáticamente de la evidencia canónica");
assert.ok(fastSql.includes("transactions_reconciliation_status_effective_idx"),"El estado generado debe quedar indexado para filtros masivos");
assert.ok(fastSql.includes("t.reconciliation_status_effective as reconciliation_status"),"Home pulse debe leer el estado generado sin función por fila");
assert.ok(!fastSql.includes("financial_app.effective_reconciliation_status(t)"),"La ruta rápida no puede volver a materializar cada movimiento como registro ancho");
assert.ok(fastSql.includes("count(*) filter(where reconciliation_status_effective='reconciled')"),"El resumen de conciliación debe usar directamente el estado generado");
assert.ok(fastSql.includes("'generatedReconciliationStatus',true"),"Home pulse debe declarar la ruta rápida en sus reglas de diagnóstico");
for(const token of ["is_reconciled is true","is_reconciled is false","source_reconciled","'no aplica'","'pendiente'","'not_reconciled'","'not_applicable'"])
  assert.ok(fastSql.includes(token),`La columna generada debe conservar la semántica canónica de conciliación: ${token}`);

assert.ok(sql.includes("create or replace function financial_app.home_accounts_core()"),"Debe existir un snapshot de cuentas específico para Inicio");
assert.ok(sql.includes("transactions_latest_source_balance_idx")===false,"El SQL no debe acoplarse al nombre físico del índice; debe beneficiarse del predicado canónico");
assert.equal((sql.match(/left join lateral \(/g)||[]).length,2,"Home accounts debe resolver solo saldo actual y saldo previo, no series completas");
for(const forbidden of ["generate_series(","account_source_aliases","count(*)::int as movements","month_income","month_expenses","month_net"])
  assert.ok(!sql.includes(forbidden),`Home accounts no debe recuperar datos exclusivos de /cuentas: ${forbidden}`);
assert.ok(sql.includes("revoke all on function financial_app.home_accounts_core() from public,anon"),"El core privado de Home accounts debe bloquear PUBLIC/anon");
assert.ok(sql.includes("grant execute on function financial_app.home_accounts_core() to authenticated,service_role"),"El wrapper SECURITY INVOKER necesita acceso explícito y privado al core");
assert.ok(sql.includes("security invoker"),"El wrapper público de Home accounts debe ser SECURITY INVOKER");
assert.ok(sql.includes("revoke all on function public.financial_app_home_accounts() from public,anon"),"Home accounts debe bloquear PUBLIC/anon");
assert.ok(sql.includes("grant execute on function public.financial_app_home_accounts() to authenticated,service_role"),"Home accounts debe mantener acceso privado autenticado");

assert.ok(page.includes("getHomeAccountsOverview"),"Inicio debe usar el snapshot ligero de cuentas");
assert.ok(!page.includes("getAccountsOverview"),"Inicio no debe volver al RPC completo de Cuentas");
assert.ok(!page.includes("getHomeReconciliationSummary"),"Inicio no debe volver a disparar la segunda RPC de conciliación");
assert.ok(page.includes("reconciliation={pulse.reconciliation}"),"Inicio debe reutilizar la conciliación ya incluida en Home pulse");

assert.ok(accounts.includes('supabase.rpc("financial_app_home_accounts")'),"El loader ligero debe apuntar a su RPC específica");
assert.ok(accounts.includes("export async function getAccountsOverview()"),"La ruta completa de Cuentas debe permanecer intacta");
assert.ok(sections.includes('Promise<HomeAccountsOverview>'),"La sección de Inicio debe aceptar el payload estrecho");
assert.ok(sections.includes("account.previousBalance"),"La variación reciente debe calcularse con el único saldo histórico necesario");
assert.ok(!sections.includes("account.balanceSeries"),"Inicio no debe depender de la serie de 12 meses");
assert.ok(pulse.includes("reconciliation:{"),"El parser de Home pulse debe conservar el resumen integrado");

console.log("Home runtime performance tests OK · cuentas estrechas, conciliación integrada y estado generado indexable sin función compuesta por fila");
