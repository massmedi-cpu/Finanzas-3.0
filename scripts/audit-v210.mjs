import{existsSync,readFileSync,readdirSync,statSync}from"node:fs";import{join}from"node:path";
const errors=[];
const need=["components/intent-link.tsx","components/app-navigation.tsx","app/loading.tsx","app/globals.css","app/chrome.css","app/typography.css","docs/RELEASE_GATE_V2.1.0.md","docs/PERFORMANCE_V2.1.0.md","docs/COHERENCE_V2.1.0.md","docs/legacy/RELEASE_GATE_V2.1.0_PRE_REBUILD.md"];
for(const file of need)if(!existsSync(file))errors.push(`Falta ${file}`);
function pagesWithNestedNavigation(dir){const found=[];for(const name of readdirSync(dir)){const path=join(dir,name);const stat=statSync(path);if(stat.isDirectory())found.push(...pagesWithNestedNavigation(path));else if(name==="page.tsx"){const text=readFileSync(path,"utf8");if(text.includes("AppNavigation")||text.includes("AppSidebar"))found.push(path)}}return found}
if(!errors.length){
  const intent=readFileSync("components/intent-link.tsx","utf8");const navigation=readFileSync("components/app-navigation.tsx","utf8");const layout=readFileSync("app/layout.tsx","utf8");const globals=readFileSync("app/globals.css","utf8");const chrome=readFileSync("app/chrome.css","utf8");const typography=readFileSync("app/typography.css","utf8");const movementsClient=readFileSync("app/movimientos/movements-client.tsx","utf8");const movementsApi=readFileSync("app/api/movements/route.ts","utf8");const performance=readFileSync("docs/PERFORMANCE_V2.1.0.md","utf8");const coherence=readFileSync("docs/COHERENCE_V2.1.0.md","utf8");const planLib=readFileSync("lib/financial/plan.ts","utf8");const homePage=readFileSync("app/page.tsx","utf8");const planPage=readFileSync("app/plan/page.tsx","utf8");const gate=readFileSync("docs/RELEASE_GATE_V2.1.0.md","utf8");
  if(!intent.includes("prefetch={false}"))errors.push("IntentLink no desactiva el prefetch automático");
  for(const token of ["router.prefetch(href)","onMouseEnter","onFocus"])if(!intent.includes(token))errors.push(`IntentLink no contiene ${token}`);
  if(intent.includes('onTouchStart={event=>{warm();'))errors.push("IntentLink vuelve a duplicar prefetch y navegación en táctil");
  if(!navigation.includes('from "@/components/intent-link"')||!navigation.includes("<IntentLink"))errors.push("La navegación no usa IntentLink");
  if(navigation.includes('from "next/link"'))errors.push("AppNavigation conserva Link con prefetch automático");
  if(layout.includes("readability-v210.css"))errors.push("La legibilidad 2.1 sigue como capa histórica separada");
  if(!globals.includes("--font-xs:14px")||!globals.includes("--font-md:17px")||!globals.includes("--font-3xl:38px")||!globals.includes("font-size:var(--font-md)")||!globals.includes("font-size:var(--font-xs)"))errors.push("La base tipográfica actual no está definida mediante la escala canónica legible");
  if(!globals.includes("@media(max-width:680px)")||globals.includes("body{font-size:15px}"))errors.push("La escala móvil no debe reducir la base tipográfica canónica de 17 px");
  if(!chrome.includes(".mobile-nav a,.mobile-nav button")||!chrome.includes("min-height:48px"))errors.push("La navegación móvil no protege el objetivo táctil");
  if(!typography.includes(".mobile-nav a,.mobile-nav button")||!typography.includes("font-size:14.5px")||!typography.includes("--readable-meta:14px")||!typography.includes("--readable-control:15px"))errors.push("La navegación y la tipografía densa no protegen el nuevo mínimo legible");
  if(!gate.includes("CANDIDATA VALIDADA")||!gate.includes("2.0.1 permanece congelada"))errors.push("El gate 2.1 no protege el checkpoint 2.0.1");
  const nested=pagesWithNestedNavigation("app");if(nested.length)errors.push(`Quedan ${nested.length} navegaciones redundantes: ${nested.join(", ")}`);
  if(!movementsClient.includes('q.set("facets","0")'))errors.push("Movimientos no solicita respuestas ligeras después de la carga inicial");
  if(!movementsClient.includes("body.facets??pageData.facets"))errors.push("Movimientos no conserva las facetas iniciales cuando la respuesta ligera las omite");
  if(!movementsApi.includes('q.get("facets")==="0"')||!movementsApi.includes("delete page.facets"))errors.push("El API de Movimientos no elimina facetas repetidas cuando facets=0");
  for(const token of ["81.921 bytes","11.896 bytes","~70,8 ms","~17,7 ms"])if(!performance.includes(token))errors.push(`Falta baseline de Movimientos: ${token}`);
  for(const token of ["budget_overview_core","forecast_overview_core","goals_overview_core","net_worth_overview_core","control_center_core"])if(!coherence.includes(token))errors.push(`Falta fuente canónica documentada: ${token}`);
  if(!planLib.includes('supabase.rpc("financial_app_plan_overview"'))errors.push("Plan no usa la RPC pública única");
  if(!planPage.includes("Origen: {action.sourcePath}"))errors.push("Las prioridades del Plan no muestran sourcePath");
  if(!homePage.includes("PRÓXIMOS 30 DÍAS"))errors.push("Inicio no identifica el horizonte inmediato de 30 días");
  if(!planPage.includes("90 días"))errors.push("Plan no identifica el horizonte de 90 días");
}
if(errors.length){console.error("Financial App 2.1 audit FAILED");errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
console.log("Financial App 2.1 audit OK · navegación táctil, escala tipográfica canónica legible, shell único, Movimientos ligero y Plan coherente");
