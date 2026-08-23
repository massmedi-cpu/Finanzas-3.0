import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const layout=read("app/layout.tsx");
const visual=read("app/visual-v300.css");
const chromeCss=read("app/chrome.css");
const loading=read("app/loading.tsx");
const chrome=read("components/app-chrome.tsx");
const sidebar=read("components/app-sidebar.tsx");
const cashFlow=read("components/cash-flow-chart.tsx");
const analysis=read("components/analysis-trend-chart.tsx");
const balance=read("components/balance-chart.tsx");
const netWorth=read("components/net-worth-chart.tsx");
const archive=read("app/archivo/archive-client.tsx");
const archiveCss=read("app/archive.css");
const movements=read("app/movimientos/movements-client.tsx");
const vercel=read("vercel.json");

const checks=[
  [layout.includes('import "./visual-v300.css"'),"la base visual 3.0 debe cargarse desde el layout raíz"],
  [layout.lastIndexOf('visual-v300.css')>layout.lastIndexOf('integrity.css'),"visual-v300.css debe cargarse después de las hojas heredadas"],
  [visual.includes("--chart-income")&&visual.includes("--chart-expense")&&visual.includes("--chart-accent")&&visual.includes("--chart-grid"),"debe existir una semántica común de colores para gráficos"],
  [visual.includes('html[data-theme="light"]')&&visual.includes('html[data-theme="dark"]'),"la paleta común debe soportar tema claro y oscuro explícitos"],
  [visual.includes(".home-kpis{grid-template-columns:repeat(12")&&visual.includes(".home-kpis a{grid-column:span 4"),"Inicio debe usar una jerarquía ejecutiva 3+3 sin huecos"],
  [visual.includes(".cf-income{fill:var(--chart-income)!important}")&&visual.includes(".cf-expense{fill:var(--chart-expense)!important}"),"Cash Flow debe reutilizar la paleta común"],
  [visual.includes(".cf-acc-line{stroke:var(--chart-accent)!important;fill:none!important}"),"el acumulado de Cash Flow debe seguir siendo una línea sin relleno"],
  [visual.includes(".a-bar-current")&&visual.includes(".a-line-current")&&analysis.includes("analysis-chart"),"Análisis debe quedar cubierto por la base común de gráficos"],
  [visual.includes(".balance-chart-line")&&visual.includes(".balance-chart-area")&&balance.includes("balance-chart-area"),"el histórico de saldo debe quedar cubierto por la base común"],
  [visual.includes(".nw-line")&&visual.includes(".nw-grid-line")&&netWorth.includes("nw-chart"),"Patrimonio debe quedar cubierto por la base común"],
  [cashFlow.includes("Ingresos / gastos")&&cashFlow.includes("const accY="),"la corrección de doble eje 2.8.1 debe permanecer intacta"],
  [loading.includes('className="route-loading-v300"')&&!loading.includes("system-state-shell")&&!loading.includes("next/image"),"la navegación privada debe usar carga local sin sustituir el shell"],
  [visual.includes("prefers-reduced-motion:reduce")&&visual.includes("v300-shimmer"),"el skeleton 3.0 debe respetar movimiento reducido"],
  [chrome.includes('<AppSidebar/><div className="app-route">{children}</div>'),"el shell persistente debe conservar sidebar y ruta separada"],
  [chromeCss.includes("html{scrollbar-gutter:stable}"),"la navegación debe reservar el gutter del scrollbar para evitar cambios de breakpoint durante la carga"],
  [sidebar.includes('onClick={()=>setMoreOpen(false)}>{label}</IntentLink>'),"los enlaces de navegación deben cerrar el menú móvil antes de iniciar la transición"],
  [chromeCss.includes('.app-root.private>.sidebar nav.mobile-nav{display:none!important}'),"el menú móvil debe permanecer oculto fuera del breakpoint móvil con especificidad superior a .sidebar nav"],
  [chromeCss.includes('.app-root.private>.sidebar nav.mobile-nav{display:flex!important;height:100%'),"el menú móvil sólo debe activarse dentro del breakpoint móvil"],
  [archive.includes("Hacer foto de ticket")&&archive.includes('capture="environment"'),"Archivo debe permitir hacer una foto de ticket con la cámara trasera"],
  [archive.includes("Elegir foto de galería")&&archive.includes("galleryRef"),"Archivo debe permitir elegir una foto existente de la galería"],
  [archive.includes("Añadir documento")&&archive.includes('accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"'),"Archivo debe mantener la importación de documentos PDF e imágenes"],
  [archiveCss.includes(".archive-module .drawer-backdrop{position:fixed;z-index:80;inset:0")&&archiveCss.includes("justify-content:flex-end"),"Archivo debe abrir el detalle como overlay fijo y no dentro del flujo de página"],
  [archiveCss.includes("@media(max-width:1050px) and (min-width:681px)")&&archiveCss.includes(".archive-drawer{flex:1 1 auto;width:100%;max-width:none"),"en tablet el panel de Archivo debe ocupar el ancho disponible completo"],
  [archiveCss.includes("height:100dvh")&&archiveCss.includes("min-width:0"),"el panel de Archivo debe respetar el viewport y permitir encogimiento sin recortes"],
  [movements.includes("Automático según reglas")&&!movements.includes(">Regla automática</option>"),"Cash Flow debe usar lenguaje comprensible en el editor"],
  [movements.includes("Automático / según origen")&&!movements.includes(">Sin override</option>"),"Conciliación debe evitar terminología técnica de override"],
  [movements.includes("No indicado")&&movements.includes("Sí, se repite")&&movements.includes("No, es puntual"),"Recurrente debe expresarse en lenguaje claro"],
  [vercel.includes('"develop/v3.0.0-foundation": false'),"la rama 3.0 debe permanecer sin Preview de Vercel"],
  [vercel.includes('"hotfix/v3.0.1-document-ux": false'),"el hotfix de captura documental debe permanecer sin Preview de Vercel"],
  [vercel.includes('"hotfix/v3.0.3-tablet-archive": false'),"el hotfix tablet de Archivo debe permanecer sin Preview de Vercel"],
];

const failures=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failures.length){
  console.error("Audit 3.0 FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Audit 3.0 OK · jerarquía, gráficos, navegación, captura documental, tablet y lenguaje de movimientos protegidos");
