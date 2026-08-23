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
  [vercel.includes('"develop/v3.0.0-foundation": false'),"la rama 3.0 debe permanecer sin Preview de Vercel"],
];

const failures=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failures.length){
  console.error("Audit 3.0 FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Audit 3.0 OK · jerarquía de Inicio, gráficos, temas, shell persistente, carga local y navegación estable protegidos");
