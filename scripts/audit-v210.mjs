import{existsSync,readFileSync,readdirSync,statSync}from"node:fs";import{join}from"node:path";
const errors=[];
const need=["components/intent-link.tsx","components/app-sidebar.tsx","app/loading.tsx","app/globals.css","app/chrome.css","docs/RELEASE_GATE_V2.1.0.md","docs/PERFORMANCE_V2.1.0.md","docs/COHERENCE_V2.1.0.md","docs/legacy/RELEASE_GATE_V2.1.0_PRE_REBUILD.md"];
for(const file of need)if(!existsSync(file))errors.push(`Falta ${file}`);
function pagesWithNestedSidebar(dir){const found=[];for(const name of readdirSync(dir)){const path=join(dir,name);const stat=statSync(path);if(stat.isDirectory())found.push(...pagesWithNestedSidebar(path));else if(name==="page.tsx"&&readFileSync(path,"utf8").includes("AppSidebar"))found.push(path)}return found}
if(!errors.length){
  const intent=readFileSync("components/intent-link.tsx","utf8");const sidebar=readFileSync("components/app-sidebar.tsx","utf8");const layout=readFileSync("app/layout.tsx","utf8");const globals=readFileSync("app/globals.css","utf8");const chrome=readFileSync("app/chrome.css","utf8");const movementsClient=readFileSync("app/movimientos/movements-client.tsx","utf8");const movementsApi=readFileSync("app/api/movements/route.ts","utf8");const performance=readFileSync("docs/PERFORMANCE_V2.1.0.md","utf8");const coherence=readFileSync("docs/COHERENCE_V2.1.0.md","utf8");const planLib=readFileSync("lib/financial/plan.ts","utf8");const homePage=readFileSync("app/page.tsx","utf8");const planPage=readFileSync("app/plan/page.tsx","utf8");const gate=readFileSync("docs/RELEASE_GATE_V2.1.0.md","utf8");
  if(!intent.includes("prefetch={false}"))errors.push("IntentLink no desactiva el prefetch automático");
  for(const token of ["router.prefetch(href)","onMouseEnter","onFocus"])if(!intent.includes(token))errors.push(`IntentLink no contiene ${token}`);
  if(intent.includes('onTouchStart={event=>{warm();'))errors.push("IntentLink vuelve a duplicar prefetch y navegación en táctil");
  if(!sidebar.includes('from "@/components/intent-link"')||!sidebar.includes("<IntentLink"))errors.push("La navegación no usa IntentLink");
  if(sidebar.includes('from "next/link"'))errors.push("AppSidebar conserva Link con prefetch automático");
  if(layout.includes("readability-v210.css"))errors.push("La legibilidad 2.1 sigue como capa histórica separada");
  if(!globals.includes(".eyebrow{font-size:12px;")||!globals.includes(".brand small{margin-top:2px;font-size:13px;"))errors.push("La legibilidad consolidada no preserva tamaños mínimos");
  if(!chrome.includes("font-size:13px!important")||!chrome.includes("line-height:1.2"))errors.push("La navegación móvil no queda protegida a 13 px");
  if(!gate.includes("CANDIDATA VALIDADA")||!gate.includes("2.0.1 permanece congelada"))errors.push("El gate 2.1 no protege el checkpoint 2.0.1");
  const nested=pagesWithNestedSidebar("app");if(nested.length)errors.push(`Quedan ${nested.length} AppSidebar redundantes: ${nested.join(", ")}`);
  if(!movementsClient.includes('q.set("facets","0")'))errors.push("Movimientos no solicita respuestas ligeras después de la carga inicial");
  if(!movementsClient.includes("body.facets??pageData.facets"))errors.push("Movimientos no conserva las facetas iniciales cuando la respuesta ligera las omite");
  if(!movementsApi.includes('q.get("facets")==="0"')||!movementsApi.includes("delete page.facets"))errors.push("El API de Movimientos no elimina facetas repetidas cuando facets=0");
  for(const token of ["81.921 bytes","11.896 bytes","~70,8 ms","~17,7 ms"])if(!performance.includes(token))errors.push(`Falta baseline de Movimientos: ${token}`);
  for(const token of ["budget_overview_core","forecast_overview_core","goals_overview_core","net_worth_overview_core","control_center_core"])if(!coherence.includes(token))errors.push(`Falta fuente canónica documentada: ${token}`);
  if(!planLib.includes('supabase.rpc("financial_app_plan_overview"'))errors.push("Plan no usa la RPC pública única");if(!planPage.includes("Origen: {action.sourcePath}"))errors.push("Las prioridades del Plan no muestran sourcePath");if(!homePage.includes("PRÓXIMOS 30 DÍAS"))errors.push("Inicio no identifica el horizonte inmediato de 30 días");if(!planPage.includes("90 días"))errors.push("Plan no identifica el horizonte de 90 días");
}
if(errors.length){console.error("Financial App 2.1 audit FAILED");errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
console.log("Financial App 2.1 audit OK · navegación táctil, legibilidad consolidada, shell único, Movimientos ligero y Plan coherente");
