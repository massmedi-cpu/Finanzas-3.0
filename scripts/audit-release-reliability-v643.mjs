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
  "/ /cash-flow /movimientos /analisis /prevision /archivo /configuracion",
  "/api/archive /api/settings /api/forecast /api/control/matching-quality /api/intelligence",
  "Production did not become globally consistent"
])must(workflow.includes(token),`Smoke 6.4.3 incompleto: ${token}`);

must(!workflow.includes("Wait for exact production version"),"El smoke no puede volver a esperar únicamente /login");
must(workflow.includes("Verify protected application routes"),"Debe conservarse la verificación final de rutas privadas");
must(workflow.includes("Verify private API boundary"),"Debe conservarse la verificación final de APIs privadas");

for(const [source,baseline,label] of [
  [v640,"6.4.0","6.4.0"],
  [v641,"6.4.1","6.4.1"],
  [v642,"6.4.2","6.4.2"]
]){
  must(source.includes('from "./lib/version-baseline.mjs"'),`El gate ${label} debe usar el comparador semver compartido`);
  must(source.includes(`versionAtLeast(currentVersion,"${baseline}")`),`El gate ${label} debe aceptar cualquier versión igual o posterior a ${baseline}`);
}

if(failures.length){console.error("Financial App 6.4.3 release reliability audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.3 release reliability audit OK · propagación global estable y gates históricos forward-compatible entre familias");
