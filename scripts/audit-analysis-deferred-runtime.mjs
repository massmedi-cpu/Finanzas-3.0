import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const page=read("app/analisis/page.tsx");
const deferred=read("components/analysis-visual-deferred.tsx");
const dashboard=read("components/analysis-visual-dashboard.tsx");
const css=read("app/analysis-visual-wall.css");

must(page.includes('from "@/components/analysis-visual-deferred"'),"Análisis debe entrar por el boundary visual diferido");
must(!page.includes('from "@/components/analysis-visual-dashboard"'),"La página de Análisis no puede importar estáticamente el runtime de 24 gráficos");
must(page.includes("<AnalysisVisualDeferred"),"Falta el boundary diferido en la página de Análisis");

for(const token of [
  'import("@/components/analysis-visual-dashboard")',
  'IntersectionObserver',
  'requestIdleCallback',
  'rootMargin:"160px 0px"',
  'PLACEHOLDER_COUNT=24',
  'globalThis.setTimeout(callback,80)',
  'aria-busy={state==="loading"||undefined}',
  'Reintentar gráficos',
  'Cargar gráficos ahora',
]) must(deferred.includes(token),`Boundary visual diferido incompleto: ${token}`);
must(!deferred.includes('import { AnalysisVisualDashboard }'),"El boundary no debe recuperar un import runtime estático del dashboard");
must(deferred.includes('loadingRef.current=null;setState("error")'),"Un fallo de chunk debe permitir reintento y no bloquear Análisis");

for(const token of [
  ".analysis-viz-placeholder{display:grid",
  "min-height:322px",
  ".analysis-viz-placeholder{min-height:250px}",
  ".analysis-viz-grid>div{content-visibility:auto;contain-intrinsic-size:auto 338px}",
]) must(css.includes(token),`Placeholder diferido sin geometría estable: ${token}`);
must(!css.includes("analysis-viz-placeholder{animation:"),"Los 24 placeholders no deben introducir una animación continua de CPU");

must(dashboard.includes("24 gráficos e informes rápidos"),"El runtime diferido debe conservar los 24 gráficos");
const defaultOrder=dashboard.match(/const DEFAULT_ORDER:ChartId\[\]=\[([\s\S]*?)\];/)?.[1]||"";
const chartIds=[...defaultOrder.matchAll(/"([a-z0-9-]+)"/g)].map(match=>match[1]);
must(chartIds.length===24&&new Set(chartIds).size===24,`El panel visual debe conservar 24 gráficos únicos; encontrados ${chartIds.length}`);
must(dashboard.includes("Personalizar gráficos")&&dashboard.includes("Restablecer"),"La carga diferida no puede eliminar personalización o restauración del panel");

if(failures.length){
  console.error("Analysis deferred runtime audit FAILED");
  failures.forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log("Analysis deferred runtime audit OK · dashboard de 24 gráficos fuera del camino inicial · carga por viewport/idle · placeholders estables · retry protegido");
