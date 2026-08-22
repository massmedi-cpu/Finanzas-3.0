import{existsSync,readFileSync,readdirSync,statSync}from"node:fs";import{join}from"node:path";
const errors=[];
const need=["components/intent-link.tsx","components/app-sidebar.tsx","app/loading.tsx","app/readability-v210.css","docs/RELEASE_GATE_V2.1.0.md","docs/legacy/RELEASE_GATE_V2.1.0_PRE_REBUILD.md"];
for(const file of need)if(!existsSync(file))errors.push(`Falta ${file}`);
function pagesWithNestedSidebar(dir){const found=[];for(const name of readdirSync(dir)){const path=join(dir,name);const stat=statSync(path);if(stat.isDirectory())found.push(...pagesWithNestedSidebar(path));else if(name==="page.tsx"&&readFileSync(path,"utf8").includes("AppSidebar"))found.push(path)}return found}
if(!errors.length){
  const intent=readFileSync("components/intent-link.tsx","utf8");
  const sidebar=readFileSync("components/app-sidebar.tsx","utf8");
  const layout=readFileSync("app/layout.tsx","utf8");
  const readability=readFileSync("app/readability-v210.css","utf8");
  const gate=readFileSync("docs/RELEASE_GATE_V2.1.0.md","utf8");
  if(!intent.includes("prefetch={false}"))errors.push("IntentLink no desactiva el prefetch automático");
  for(const token of ["router.prefetch(href)","onMouseEnter","onFocus","onTouchStart"])if(!intent.includes(token))errors.push(`IntentLink no contiene ${token}`);
  if(!sidebar.includes('from "@/components/intent-link"')||!sidebar.includes("<IntentLink"))errors.push("La navegación no usa IntentLink");
  if(sidebar.includes('from "next/link"'))errors.push("AppSidebar conserva Link con prefetch automático");
  if(!layout.includes('./readability-v210.css'))errors.push("La capa 2.1 de legibilidad no está cargada");
  if(!readability.includes("font-size:13px!important"))errors.push("La navegación móvil no queda protegida a 13 px");
  if(!readability.includes(".eyebrow{font-size:12px}"))errors.push("Las etiquetas eyebrow siguen sin mínimo legible");
  if(!gate.includes("Estado: EN DESARROLLO")||!gate.includes("2.0.1 permanece congelada"))errors.push("El gate 2.1 no protege explícitamente el checkpoint 2.0.1");
  const nested=pagesWithNestedSidebar("app");
  if(nested.length)errors.push(`Quedan ${nested.length} AppSidebar redundantes: ${nested.join(", ")}`);
}
if(errors.length){console.error("Financial App 2.1 audit FAILED");errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
console.log("Financial App 2.1 audit OK · navegación por intención, legibilidad, shell único y checkpoint protegido");
