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
const chromeCss=read("app/chrome.css");
const navigation=read("components/app-navigation.tsx");
const chrome=read("components/app-chrome.tsx");
const chart=read("components/cash-flow-chart.tsx");
const layout=read("app/layout.tsx");
const loading=read("app/loading.tsx");
const errorState=read("app/error.tsx");
const dialogBoundary=read("components/accessible-dialog-boundary.tsx");
const movementLayout=read("app/movimientos/layout.tsx");
const archiveLayout=read("app/archivo/layout.tsx");
const budgetLayout=read("app/presupuesto/layout.tsx");
const forecastLayout=read("app/prevision/layout.tsx");
const goalsLayout=read("app/objetivos/layout.tsx");
const rulesLayout=read("app/reglas/layout.tsx");
const netWorthLayout=read("app/patrimonio/layout.tsx");
const movementsClient=read("app/movimientos/movements-client.tsx");
const archiveClient=read("app/archivo/archive-client.tsx");
const budgetClient=read("app/presupuesto/budget-client.tsx");
const forecastClient=read("app/prevision/forecast-client.tsx");
const goalsClient=read("app/objetivos/goals-client.tsx");
const rulesClient=read("app/reglas/rules-client.tsx");
const netWorthClient=read("app/patrimonio/net-worth-client.tsx");

if(!globals.includes(".skip-link")) errors.push("Falta estilo global del enlace para saltar al contenido");
if(!globals.includes(":focus-visible")) errors.push("Falta foco visible global");
if(!globals.includes("prefers-reduced-motion:reduce")) errors.push("Falta soporte prefers-reduced-motion");
if(!globals.includes("forced-colors:active")) errors.push("Falta soporte básico para colores forzados");
if(!layout.includes('lang="es-ES"')) errors.push("El idioma raíz debe identificar español de España");
if(!layout.includes('viewportFit:"cover"')) errors.push("La PWA debe declarar viewport-fit=cover para gestionar safe areas en dispositivos con notch");
for(const token of [
  "safe-area-inset-top",
  "safe-area-inset-bottom",
  "safe-area-inset-left",
  "safe-area-inset-right",
]){
  if(!chromeCss.includes(token)) errors.push(`El shell móvil no protege ${token}`);
}
if(!chromeCss.includes("padding-top:calc(62px + env(safe-area-inset-top,0px))")) errors.push("El contenido móvil no reserva la altura de la cabecera más el safe area superior");
if(!chromeCss.includes("height:calc(62px + env(safe-area-inset-top,0px))")) errors.push("La cabecera móvil no integra el safe area superior");
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

if(existsSync("components/detail-dialog-boundary.tsx")) errors.push("El controlador modal específico antiguo debe permanecer retirado");
for(const token of [
  "MutationObserver",
  "event.key===\"Escape\"",
  "event.key!==\"Tab\"",
  "root.style.overflow=\"hidden\"",
  "body.style.overflow=\"hidden\"",
  "restore.focus()",
  "focusDialog(dialog)",
  "dialogBusy(dialog)",
  "[aria-busy=\"true\"],.is-loading",
  "data-dialog-boundary=\"accessible\"",
]){
  if(!dialogBoundary.includes(token)) errors.push(`El controlador modal compartido ha perdido comportamiento: ${token}`);
}

const modalRoutes=[
  ["Movimientos",movementLayout,movementsClient,true],
  ["Archivo",archiveLayout,archiveClient,true],
  ["Presupuesto",budgetLayout,budgetClient,false],
  ["Previsión",forecastLayout,forecastClient,false],
  ["Objetivos",goalsLayout,goalsClient,false],
  ["Reglas",rulesLayout,rulesClient,false],
  ["Patrimonio",netWorthLayout,netWorthClient,true],
];
for(const [name,routeLayout,client,needsDrawerCss] of modalRoutes){
  if(!routeLayout.includes("AccessibleDialogBoundary")) errors.push(`${name}: falta la frontera modal accesible compartida`);
  if(!routeLayout.includes('@/components/accessible-dialog-boundary')) errors.push(`${name}: no consume el controlador modal canónico`);
  if(needsDrawerCss&&!routeLayout.includes('import "../detail-dialog.css";')) errors.push(`${name}: falta el estilo de cajón compartido route-scoped`);
  if(!client.includes('role="dialog"')||!client.includes('aria-modal="true"')||!client.includes('aria-label="Cerrar"')) errors.push(`${name}: el modal no conserva semántica/cierre accesible`);
}
if(!netWorthClient.includes('aria-busy={busy ? "true" : undefined}')) errors.push("Patrimonio debe impedir cierre por Escape mientras guarda el editor");

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
console.log(`Financial App accessibility audit OK · ${protectedPages.length} pantallas autenticadas · 7 superficies modales con foco/Escape/scroll compartidos · shell único, safe areas PWA, navegación, carga, errores, movimiento reducido y gráficos cubiertos`);
