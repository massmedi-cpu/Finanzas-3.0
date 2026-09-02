import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const route=readFileSync("app/api/sync/route.ts","utf8");
const button=readFileSync("components/sync-button.tsx","utf8");
const home=readFileSync("app/page.tsx","utf8");
const edge=readFileSync("supabase/functions/financial-app-sync/index.ts","utf8");

assert.match(route,/supabase\.rpc\("financial_app_home_pulse",\{\}\)/,"sync API must verify persisted canonical state after upstream sync");
assert.match(route,/sourceChangedNoMovementRows=sourceChanged&&newCount===0&&updatedCount===0&&reviewSourceCount===0/,"changed source with zero movement delta must be explicit");
assert.match(route,/verificationStatus:sourceUnchanged\?"source_unchanged":sourceChangedNoMovementRows\?"source_changed_no_movement_rows":"verified"/,"diagnostics must expose a stable verification state");
for(const field of ["sourceModifiedAt","rowsSeen","newCount","updatedCount","reviewSourceCount","latestMovementDate","documentChanged","autoLinked"]){
  assert.ok(route.includes(field),`sync diagnostics must expose ${field}`);
}
assert.match(route,/payload\.diagnostics=\{verificationStatus:"unavailable"\}/,"diagnostic lookup failure must not masquerade as verified");

assert.ok(button.includes("XLSX comprobado sin cambios"),"UI must distinguish an unchanged source");
assert.ok(button.includes("El XLSX cambió, pero no produjo movimientos nuevos o modificados"),"UI must surface suspicious zero-delta source changes");
assert.match(button,/verificationWarning=nextDiagnostics\?\.sourceChangedNoMovementRows===true/,"zero-delta source changes must render as warning");
assert.ok(button.includes("filas leídas"),"UI must show parsed movement row count when available");
assert.ok(button.includes("último movimiento"),"UI must show latest persisted movement date");
assert.match(button,/role="status"/,"sync result must be announced accessibly");
assert.ok(home.includes('import "./home-sync.css"'),"Home must load dedicated responsive sync-result styles");

assert.match(edge,/rowCount = items\.length/,"Edge sync must report parsed row count");
assert.match(edge,/sync = await applySnapshot\(meta, items\)/,"Edge sync must return canonical snapshot counters");
assert.match(edge,/sourceChanged,\n\s*documentChanged,\n\s*autoLinked/,"Edge metrics must keep source/document/link phases observable");

console.log("Sync observability and post-write verification contract: OK");
