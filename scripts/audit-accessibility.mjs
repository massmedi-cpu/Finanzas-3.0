import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const errors=[];
const read=(path)=>readFileSync(path,"utf8");
function walk(dir){
  if(!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path]});
}

for(const required of ["app/loading.tsx","app/error.tsx","app/not-found.tsx","app/system-state.css"]){
  if(!existsSync(required)) errors.push(`Falta estado global accesible: ${required}`);
}
const globals=read("app/globals.css");
const sidebar=read("components/app-sidebar.tsx");
const chart=read("components/cash-flow-chart.tsx");
const layout=read("app/layout.tsx");
const loading=read("app/loading.tsx");
const errorState=read("app/error.tsx");

if(!globals.includes(".skip-link")) errors.push("Falta estilo global del enlace para saltar al contenido");
if(!globals.includes(":focus-visible")) errors.push("Falta foco visible global");
if(!globals.includes("prefers-reduced-motion:reduce")) errors.push("Falta soporte prefers-reduced-motion");
if(!globals.includes("forced-colors:active")) errors.push("Falta soporte básico para colores forzados");
if(!layout.includes('lang="es-ES"')) errors.push("El idioma raíz debe identificar español de España");
if(!sidebar.includes('href="#main-content"')) errors.push("La navegación no ofrece salto al contenido principal");
if(!sidebar.includes("aria-current={current ? \"page\" : undefined}")) errors.push("La navegación no marca aria-current=page");
if(!chart.includes("Ver datos del gráfico en tabla")) errors.push("Cash Flow no ofrece alternativa tabular accesible");
if(!chart.includes("<caption")) errors.push("La tabla accesible del gráfico no tiene caption");
if(!chart.includes('role="group"')) errors.push("Los controles de series del gráfico no están agrupados semánticamente");
if(!loading.includes('role="status"')||!loading.includes('aria-live="polite"')||!loading.includes('aria-busy="true"')) errors.push("El estado de carga no comunica actividad de forma accesible");
if(!errorState.includes('role="alert"')||!errorState.includes("reset")) errors.push("El estado de error no es anunciable o recuperable");

const pages=walk("app").filter(path=>path.endsWith("page.tsx"));
let protectedPages=0;
for(const page of pages){
  const text=read(page);
  if(!text.includes("<AppSidebar")) continue;
  protectedPages++;
  if(!text.includes('id="main-content"')) errors.push(`${page}: falta id=main-content`);
  if(!text.includes("tabIndex={-1}")) errors.push(`${page}: el contenido principal no admite foco programático`);
}
if(protectedPages<10) errors.push(`Solo se detectaron ${protectedPages} pantallas autenticadas; revisar cobertura del auditor`);

if(errors.length){
  console.error("Financial App accessibility audit FAILED");
  for(const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Financial App accessibility audit OK · ${protectedPages} pantallas autenticadas · navegación, foco, carga, errores, movimiento reducido y gráficos cubiertos`);
