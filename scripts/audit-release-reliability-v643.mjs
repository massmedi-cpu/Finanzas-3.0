import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const workflow=read(".github/workflows/production-smoke.yml");
const v640=read("scripts/audit-release-v640.mjs");
const v641=read("scripts/audit-release-v641.mjs");
const v642=read("scripts/audit-release-v642.mjs");

for(const token of [
  "Wait for globally consistent production version",
  "stable_passes=0",
  "stable_passes=$((stable_passes + 1))",
  '[ "$stable_passes" -ge 2 ]',
  '[ "$stable_passes" -lt 2 ]',
  "Cache-Control: no-cache",
  "login_ready",
  "route_ready",
  "api_ready",
  "/ /cash-flow /movimientos /analisis /archivo /configuracion",
  "/api/archive /api/settings /api/forecast /api/control/matching-quality /api/intelligence",
  "Production did not become globally consistent"
])must(workflow.includes(token),`Smoke 6.4.3 incompleto: ${token}`);

must(!workflow.includes("Wait for exact production version"),"El smoke no puede volver a esperar únicamente /login");
must(workflow.includes("Verify protected application routes"),"Debe conservarse la verificación final de rutas privadas");
must(workflow.includes("Verify private API boundary"),"Debe conservarse la verificación final de APIs privadas");

must(v640.includes('/^6\\.4\\.\\d+$/.test(currentVersion)'),"El gate 6.4.0 debe aceptar la familia 6.4.x sin enumeración manual");
must(v641.includes('currentVersion.match(/^6\\.4\\.(\\d+)$/)')&&v641.includes("patch>=1"),"El gate 6.4.1 debe aceptar futuros patch 6.4.x desde patch 1");
must(v642.includes('currentVersion.match(/^6\\.4\\.(\\d+)$/)')&&v642.includes("patch>=2"),"El gate 6.4.2 debe aceptar futuros patch 6.4.x desde patch 2");

if(failures.length){console.error("Financial App 6.4.3 release reliability audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.3 release reliability audit OK · propagación global estable y gates históricos 6.4.x forward-compatible");
