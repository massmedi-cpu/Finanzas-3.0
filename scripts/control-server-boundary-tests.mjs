import assert from "node:assert/strict";
import fs from "node:fs";

const view=fs.readFileSync("app/control/control-client.tsx","utf8");
const actions=fs.readFileSync("app/control/control-actions.tsx","utf8");
const page=fs.readFileSync("app/control/page.tsx","utf8");

assert.ok(!/^\s*["']use client["'];/m.test(view),"la presentación principal de Control debe permanecer en servidor");
assert.ok(/^\s*["']use client["'];/m.test(actions),"solo las mutaciones de Control deben cruzar la frontera cliente");
assert.ok(actions.includes("useRouter")&&actions.includes("router.refresh()"),"las mutaciones deben refrescar la evidencia servidor sin duplicar el estado financiero en cliente");
assert.ok(actions.includes('fetch("/api/control"'),"las acciones deben conservar la API de mutación existente");
assert.ok(view.includes("ControlAlertActions")&&view.includes("CloseMonthActions")&&view.includes("ReopenMonthAction"),"la vista servidor debe delegar solo los controles interactivos");
assert.ok(!view.includes("useState(")&&!view.includes("useMemo("),"la vista financiera no debe volver a mantener una copia cliente del snapshot");
assert.ok(!view.includes("fetch(`/api/control?month="),"Control no debe volver a descargar en cliente el mismo resumen que ya renderizó el servidor");
assert.ok(page.includes("<ControlClient initialData={data}/>"),"la ruta debe conservar el contrato de composición actual");

console.log("control server boundary tests OK · presentación financiera en servidor y mutaciones aisladas en cliente");
