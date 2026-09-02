import assert from "node:assert/strict";
import fs from "node:fs";
import { movementRpcFilterParams } from "../lib/financial/movement-api-params";
import { movementSelectionScopeKey, movementState } from "../lib/financial/movement-query";

const params=new URLSearchParams({
  search:"supermercado",account:"00000000-0000-0000-0000-000000000001",category:"Alimentación",
  review:"1",duplicate:"0",documents:"1",splits:"0",from:"2026-08-01",to:"2026-08-31",
  min:"-100,50",max:"250,25",sort:"amount_desc",cashFlow:"1",
});
const rpc=movementRpcFilterParams(params);
assert.equal(rpc.p_search,"supermercado");
assert.equal(rpc.p_category,"Alimentación");
assert.equal(rpc.p_review_only,true);
assert.equal(rpc.p_duplicate,false);
assert.equal(rpc.p_has_documents,true);
assert.equal(rpc.p_has_splits,false);
assert.equal(rpc.p_min_amount,-100.5);
assert.equal(rpc.p_max_amount,250.25);
assert.equal(rpc.p_sort,"amount_desc");
assert.equal(rpc.p_cash_flow_only,true);

const base=movementState({search:"luz",category:"Hogar"});
const sorted=movementState({...base,sort:"amount_desc"});
const changed=movementState({...base,category:"Transporte"});
assert.equal(movementSelectionScopeKey(base),movementSelectionScopeKey(sorted),"Cambiar solo el orden no cambia qué movimientos pertenecen al lote");
assert.notEqual(movementSelectionScopeKey(base),movementSelectionScopeKey(changed),"Cambiar filtros semánticos debe invalidar la selección oculta");

const listRoute=fs.readFileSync("app/api/movements/route.ts","utf8");
const selectionRoute=fs.readFileSync("app/api/movements/selection/route.ts","utf8");
const client=fs.readFileSync("app/movimientos/movements-client.tsx","utf8");
const lazyTools=fs.readFileSync("app/movimientos/movement-lazy-tools.tsx","utf8");
const detailDrawer=fs.readFileSync("app/movimientos/movement-detail-drawer.tsx","utf8");
const sql=fs.readFileSync("database/FINANCIAL_APP_9.0.0_MOVEMENT_SELECTION_FAST_PATH.sql","utf8");

assert.ok(listRoute.includes("movementRpcFilterParams(q)"),"Listado y selección deben compartir el mismo parser de filtros");
assert.ok(selectionRoute.includes('rpc("financial_app_movements_selection"'),"La selección masiva debe usar el RPC ligero dedicado");
assert.ok(selectionRoute.includes("p_limit")&&selectionRoute.includes("Math.min(200"),"El endpoint debe mantener el límite seguro de 200 IDs");
assert.ok(!selectionRoute.includes("financial_app_movements_advanced"),"Seleccionar IDs no puede reconstruir movimientos enriquecidos");

assert.ok(client.includes("new AbortController()")&&client.includes("signal:controller.signal")&&client.includes("listAbortRef.current?.abort()"),"Las recargas deben cancelar la petición anterior para impedir carreras de UI");
assert.ok(client.includes("movementSelectionScopeKey")&&client.includes("selectionScopeChanged")&&client.includes("Selección reiniciada porque cambió el conjunto de filtros"),"La selección oculta debe limpiarse cuando cambia su ámbito semántico");
assert.ok(client.includes("/api/movements/selection?")&&!client.includes('q.set("pageSize",String(MAX_BULK_MOVEMENTS))'),"Seleccionar filtrados debe dejar de descargar 200 movimientos completos");
assert.ok(client.includes('from "./movement-lazy-tools"')&&client.includes("MovementDetailDrawer"),"El cliente inicial debe entrar al editor individual por el boundary lazy");
assert.ok(!client.includes('className="movement-editor"')&&!client.includes("restoreSource")&&!client.includes("buildPatch"),"Formulario, restauración y patch detallado no deben volver al bundle inicial de Movimientos");
assert.ok(client.length<28000,`El cliente inicial de Movimientos ha vuelto a crecer demasiado (${client.length} bytes)`);
assert.ok(lazyTools.includes("dynamic(")&&lazyTools.includes("ssr:false")&&lazyTools.includes('import("./bulk-movement-editor")')&&lazyTools.includes('import("./movement-detail-drawer")'),"Editor masivo y drawer individual deben quedar en chunks diferidos");
assert.ok(detailDrawer.includes('from "./movement-documents"')&&detailDrawer.includes('from "./split-editor"'),"Documentos y splits deben viajar con el runtime diferido del detalle, no con la tabla inicial");
for(const token of ["Origen protegido","Restaurar origen","Historial de cambios","Cambios guardados y registrados en el historial","Ediciones restauradas al estado derivado del origen"])
  assert.ok(detailDrawer.includes(token),`El drawer diferido ha perdido un contrato de edición segura: ${token}`);

for(const token of [
  "movements_selection_core",
  "financial_app_movements_selection",
  "with matching as materialized",
  "t.search_vector @@ websearch_to_tsquery",
  "financial_app.effective_reconciliation_status(t)",
  "financial_app.transaction_documents",
  "financial_app.transaction_splits",
  "p_cash_flow_only",
  "'ids', v_ids",
  "'truncated'",
])assert.ok(sql.includes(token),`El fast path debe conservar semántica sin enriquecer filas: ${token}`);
assert.ok(!sql.includes("movements_advanced_enriched_core"),"El RPC ligero no puede delegar en el camino enriquecido");
assert.ok(!sql.includes("'facets'"),"La selección de IDs no debe calcular facetas");
assert.ok(!sql.includes("'documentCount'"),"La selección de IDs no debe construir metadatos de tarjeta");

console.log("Movement selection performance tests OK · filtros canónicos, IDs-only, límite 200, selección segura, fetch race-safe y detalle/edición fuera del bundle inicial");
