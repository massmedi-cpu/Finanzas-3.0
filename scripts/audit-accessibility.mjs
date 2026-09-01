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
const navigation=read("components/app-navigation.tsx");
const chrome=read("components/app-chrome.tsx");
const chart=read("components/cash-flow-chart.tsx");
const layout=read("app/layout.tsx");
const loading=read("app/loading.tsx");
const errorState=read("app/error.tsx");
const detailDialog=read("components/detail-dialog-boundary.tsx");
const movementLayout=read("app/movimientos/layout.tsx");
const archiveLayout=read("app/archivo/layout.tsx");
const movementsClient=read("app/movimientos/movements-client.tsx");
const archiveClient=read("app/archivo/archive-client.tsx");

if(!globals.includes(".skip-link")) errors.push("Falta estilo global del enlace para saltar al contenido");
if(!globals.includes(":focus-visible")) errors.push("Falta foco visible global");
if(!globals.includes("prefers-reduced-motion:reduce")) errors.push("Falta soporte prefers-reduced-motion");
if(!globals.includes("forced-colors:active")) errors.push("Falta soporte básico para colores forzados");
if(!layout.includes('lang="es-ES"')) errors.push("El idioma raíz debe identificar español de España");
if(!chrome.includes("<AppNavigation")) errors.push("El shell persistente no monta la navegación principal");
if(!navigation.includes('href="#main-content"')) errors.push("La navegación no ofrece salto al contenido principal");
if(!/aria-current\s*=\s*\{\s*current\s*\?\s*["']page["']\s*:\s*undefined\s*\}/.test(navigation)) errors.push("La navegación no marca aria-current=page");
if(!navigation.includes('aria-expanded={moreOpen}')||!navigation.includes('aria-controls="product-more-menu"')) errors.push("El menú secundario no comunica su estado expandido");
if(!navigation.includes('aria-label="Navegación principal"')||!navigation.includes('aria-label="Navegación principal móvil"')) errors.push("Las variantes de navegación no tienen nombres accesibles");
if(!chart.includes("Ver datos del gráfico en tabla")) errors.push("Cash Flow no ofrece alternativa tabular accesible");
if(!chart.includes("<caption")) errors.push("La tabla accesible del gráfico no tiene caption");
if(!chart.includes('role="group"')) errors.push("Los controles de series del gráfico no están agrupados semánticamente");
if(!loading.includes('role="status"')||!loading.includes('aria-live="polite"')||!loading.includes('aria-busy="true"')) errors.push("El estado de carga no comunica actividad de forma accesible");
if(!errorState.includes('role="alert"')||!errorState.includes("reset")) errors.push("El estado de error no es anunciable o recuperable");

for(const token of ["MutationObserver","event.key===\"Escape\"","event.key!==\"Tab\"","root.style.overflow=\"hidden\"","body.style.overflow=\"hidden\"","restore.focus()","focusDialog(dialog)"]){
  if(!detailDialog.includes(token)) errors.push(`El controlador de diálogos ha perdido comportamiento modal: ${token}`);
}
for(const [name,routeLayout] of [["Movimientos",movementLayout],["Archivo",archiveLayout]]){
  if(!routeLayout.includes("DetailDialogBoundary")) errors.push(`${name}: falta el límite modal compartido`);
  if(!routeLayout.includes('import "../detail-dialog.css";')) errors.push(`${name}: falta el estilo modal compartido route-scoped`);
}
for(const [name,client] of [["Movimientos",movementsClient],["Archivo",archiveClient]]){
  if(!client.includes('role="dialog"')||!client.includes('aria-modal="true"')||!client.includes('aria-label="Cerrar"')) errors.push(`${name}: el cajón de detalle no conserva semántica/cierre accesible`);
}

const pages=walk("app").filter(path=>path.endsWith("page.tsx"));
const protectedPages=pages.filter(page=>read(page).includes('id="main-content"'));
for(const page of protectedPages){
  const text=read(page);
  if(!text.includes("tabIndex={-1}")) errors.push(`${page}: el contenido principal no admite foco programático`);
  if(text.includes("<AppNavigation")||text.includes("<AppSidebar")) errors.push(`${page}: duplica la navegación que ya proporciona AppChrome`);
}
if(protectedPages.length<10) errors.push(`Solo se detectaron ${protectedPages.length} pantallas autenticadas; revisar cobertura del auditor`);

if(errors.length){
  console.error("Financial App accessibility audit FAILED");
  for(const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Financial App accessibility audit OK · ${protectedPages.length} pantallas autenticadas · shell único, navegación, foco, diálogos, carga, errores, movimiento reducido y gráficos cubiertos`);
