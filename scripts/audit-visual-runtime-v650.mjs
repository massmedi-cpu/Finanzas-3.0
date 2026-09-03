import fs from "node:fs";
import {versionAtLeast} from "./lib/version-baseline.mjs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const rootLayout=read("app/layout.tsx");
const loading=read("app/route-loading.css");
const chartTokens=read("app/analisis/chart-tokens.css");
const analysisLayout=read("app/analisis/layout.tsx");
const analysisWall=read("app/analysis-visual-wall.css");
const dashboard=read("components/analysis-visual-dashboard.tsx");
const cashFlowPage=read("app/cash-flow.css");
const cashFlowChart=read("app/cash-flow-chart.css");
const cashFlowLayout=read("app/cash-flow/layout.tsx");
const home=read("app/page.tsx");
const homeSections=read("app/home-sections.tsx");
const homeCss=read("app/home.css");
const movementsCss=read("app/movements.css");
const movementsClient=read("app/movimientos/movements-client.tsx");
const archiveCss=read("app/archive.css");
const detailDialogCss=read("app/detail-dialog.css");
const editorDialogCss=read("app/editor-dialog.css");
const movementLayout=read("app/movimientos/layout.tsx");
const archiveLayout=read("app/archivo/layout.tsx");
const netWorthLayout=read("app/patrimonio/layout.tsx");
const budgetLayout=read("app/presupuesto/layout.tsx");
const forecastLayout=read("app/prevision/layout.tsx");
const goalsLayout=read("app/objetivos/layout.tsx");
const rulesLayout=read("app/reglas/layout.tsx");
const budgetCss=read("app/budget.css");
const forecastCss=read("app/forecast.css");
const goalsCss=read("app/goals.css");
const rulesCss=read("app/rules.css");
const accounts=read("app/accounts.css");
const netWorth=read("app/net-worth.css");

must(!fs.existsSync("app/visual.css"),"app/visual.css debe permanecer retirado del runtime");
must(rootLayout.includes('import "./route-loading.css";'),"El layout raíz debe cargar route-loading.css");
must(!rootLayout.includes("visual.css"),"El layout raíz no puede volver a cargar visual.css");
must(!rootLayout.includes("detail-dialog.css"),"El layout raíz no debe cargar estilos de cajón específicos de Movimientos/Archivo/Patrimonio");
must(!rootLayout.includes("editor-dialog.css"),"El layout raíz no debe cargar estilos de editor que solo necesitan rutas con modal");
must(rootLayout.indexOf('import "./route-loading.css";')<rootLayout.indexOf('import "./tablet.css";'),"Debe preservarse la cascada route-loading -> tablet");

for(const token of [".route-loading-v300","v300-shimmer","prefers-reduced-motion:reduce","@media(max-width:760px)"])
  must(loading.includes(token),`route-loading.css perdió contrato compartido: ${token}`);
for(const token of [".cf-",".balance-chart",".nw-",".analysis-","--chart-income","--chart-expense","--chart-accent","--chart-prior","--chart-grid","--chart-fill"])
  must(!loading.includes(token),`route-loading.css no debe mezclar visualización específica: ${token}`);
must(!loading.includes("!important"),"route-loading.css no debe usar !important");

for(const token of ["--chart-income","--chart-expense","--chart-accent","--chart-prior","--chart-grid","--chart-fill","html[data-theme=\"dark\"] .analysis-workspace"])
  must(chartTokens.includes(token),`Tokens de Análisis incompletos: ${token}`);
must(chartTokens.trimStart().startsWith(".analysis-workspace{"),"Los tokens de gráficas deben estar acotados a .analysis-workspace");
must(!chartTokens.includes(":root"),"Los tokens de Análisis no pueden volver al :root");
must(!chartTokens.includes("!important"),"chart-tokens.css no debe usar !important");
must(analysisLayout.includes('import "./chart-tokens.css";'),"Análisis debe cargar chart-tokens.css");
must(analysisLayout.indexOf('import "./chart-tokens.css";')<analysisLayout.indexOf('import "../analysis.css";'),"Análisis debe preservar cascada tokens -> analysis.css");

for(const token of [".cf-income",".cf-expense",".cf-acc-line",".cf-acc-dot",".cf-grid line",".cf-series-controls"])
  must(cashFlowChart.includes(token),`Gráfica Cash Flow compartida perdió contrato visual canónico: ${token}`);
for(const token of [".cf-summary",".cf-filter-panel",".cf-forecast-zone",".cf-rules"])
  must(cashFlowPage.includes(token),`Página Cash Flow perdió contrato visual propio: ${token}`);
for(const token of [".cf-income",".cf-expense",".cf-acc-line",".cf-acc-dot",".cf-series-controls"])
  must(!cashFlowPage.includes(token),`cash-flow.css no debe volver a duplicar la gráfica compartida: ${token}`);
must(home.includes('import "./cash-flow-chart.css";'),"Inicio debe cargar únicamente cash-flow-chart.css al reutilizar CashFlowChart");
must(!home.includes('import "./cash-flow.css";'),"Inicio no debe volver a cargar todos los estilos de la página Cash Flow");
must(cashFlowLayout.includes('import "../cash-flow.css";')&&cashFlowLayout.includes('import "../cash-flow-chart.css";'),"La ruta Cash Flow debe combinar estilos propios y gráfica compartida");
must(homeSections.includes("CashFlowChart"),"Inicio debe seguir reutilizando CashFlowChart");
for(const token of [".balance-chart svg",".balance-chart-line",".balance-chart-area",".balance-chart-dot"])
  must(accounts.includes(token),`Cuentas perdió contrato BalanceChart: ${token}`);
for(const token of [".nw-grid-line",".nw-line",".nw-area",".nw-dot"])
  must(netWorth.includes(token),`Patrimonio perdió contrato de gráfica: ${token}`);

for(const token of ["Drive XLSX · datos","· solo lectura","<HomeDecisionGrid analysis={analysisPromise}/>"])
  must(home.includes(token),`Inicio perdió jerarquía/frescura de fuente compacta: ${token}`);
for(const forbidden of ["home-freshness","Última comprobación","<HomeDecisionGrid pulse="])
  must(!home.includes(forbidden),`Inicio ha recuperado información redundante: ${forbidden}`);
for(const token of [
  "HomeDecisionGrid({analysis}:{analysis:Promise<AnalysisOverview>})",
  "Las seis categorías con mayor peso del periodo.",
  'aria-labelledby="home-spend-title"',
]) must(homeSections.includes(token),`Inicio perdió el bloque de concentración simplificado: ${token}`);
for(const forbidden of ["home-attention-section","home-attention-list","Qué necesita atención","Detectados en última sincronización","import type { HomePulse }"])
  must(!homeSections.includes(forbidden),`Inicio ha recuperado un panel/contrato redundante: ${forbidden}`);
must(!homeCss.includes(".home-attention-"),"home.css no debe conservar estilos del panel de atención retirado");
must(!homeCss.includes(".home-freshness"),"home.css no debe conservar el pie redundante de frescura");
must(homeCss.includes(".home-category-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:28px"),"La concentración de gasto debe aprovechar dos columnas en escritorio");
must(homeCss.includes("@media(max-width:820px){.home-account-ledger{grid-template-columns:1fr}.home-category-list{grid-template-columns:1fr}"),"La concentración de gasto debe volver a una columna en tablet/móvil");

must(analysisWall.includes("content-visibility:auto"),"La rejilla visual debe diferir pintura fuera de pantalla");
must(analysisWall.includes("contain-intrinsic-size:auto 338px"),"La pintura diferida debe reservar tamaño intrínseco");
for(const token of [
  ".home-forecast-section{content-visibility:auto;contain-intrinsic-size:auto 320px}",
  ".home-decision-grid{content-visibility:auto;contain-intrinsic-size:auto 390px}",
  ".home-forecast-section{contain-intrinsic-size:auto 360px}",
  ".home-decision-grid{contain-intrinsic-size:auto 560px}",
]) must(homeCss.includes(token),`Inicio perdió pintura diferida responsive: ${token}`);
for(const token of [
  ".movement-table tbody tr{content-visibility:auto;contain-intrinsic-size:auto 70px",
  "overscroll-behavior:contain;scrollbar-gutter:stable",
  'grid-template-areas:"select date amount" "select movement amount" "select category status" "select account status"',
]) must(movementsCss.includes(token),`Movimientos perdió rendimiento/scroll adaptable: ${token}`);
const movementRenderPaths=[...movementsClient.matchAll(/<MovementRow\b/g)];
must(movementRenderPaths.length===1,`Movimientos debe renderizar una sola representación por item; detectadas ${movementRenderPaths.length}`);
for(const forbidden of [".movement-cards{",".movement-card-row{",".movement-table-wrap{display:none}"])
  must(!movementsCss.includes(forbidden),`Movimientos ha recuperado DOM/CSS móvil duplicado: ${forbidden}`);
must(!movementsClient.includes('className="movement-cards"'),"Movimientos no debe volver a montar una segunda lista móvil");
must(!/\.movement-open strong\{[^}]*max-width:\d+vw/.test(movementsCss),"Movimientos no debe estrangular conceptos móviles con un ancho vw fijo");
for(const token of [
  "content-visibility:auto;contain-intrinsic-size:auto 76px",
  ".reconstruction,.receipt-table-wrap{overscroll-behavior:contain;scrollbar-gutter:stable}",
  ".document-card{contain-intrinsic-size:auto 84px}",
]) must(archiveCss.includes(token),`Archivo perdió rendimiento/scroll adaptable: ${token}`);

for(const token of [
  ".drawer-backdrop{position:fixed;z-index:100;inset:0;display:flex;justify-content:flex-end;overscroll-behavior:contain}",
  ".movement-drawer,.archive-drawer,.net-worth-drawer{max-width:100%;min-width:0;height:100dvh;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable",
  ".drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border-bottom:1px solid var(--border-subtle)}",
  ".trace-panel{margin-top:18px;border:1px solid var(--border-subtle);border-radius:var(--radius-medium);background:var(--surface-secondary);overflow:hidden}",
]) must(detailDialogCss.includes(token),`El cajón compartido perdió una primitiva visual: ${token}`);
const drawerRoutes=[
  ["Movimientos",movementLayout,movementsCss,'import "../movements.css";'],
  ["Archivo",archiveLayout,archiveCss,'import "../archive.css";'],
  ["Patrimonio",netWorthLayout,netWorth,'import "../net-worth.css";'],
];
for(const [name,routeLayout,localCss,localToken] of drawerRoutes){
  must(routeLayout.includes('import "../detail-dialog.css";'),`${name} debe cargar detail-dialog.css`);
  const sharedIndex=routeLayout.indexOf('import "../detail-dialog.css";');
  must(sharedIndex>=0&&sharedIndex<routeLayout.indexOf(localToken),`${name} debe cargar la base del cajón antes de sus overrides locales`);
  must(!localCss.includes("position:fixed;z-index:100;inset:0;display:flex;justify-content:flex-end"),`${name} no debe volver a duplicar la geometría base del backdrop`);
  must(!localCss.includes("background:var(--surface-elevated);border-left:1px solid var(--border-default);padding:24px;box-shadow:var(--shadow-overlay)"),`${name} no debe volver a duplicar la superficie base del cajón`);
  must(!localCss.includes("margin-top:18px;border:1px solid var(--border-subtle);border-radius:var(--radius-medium);background:var(--surface-secondary);overflow:hidden"),`${name} no debe volver a duplicar el panel técnico base`);
}
for(const token of [".nw-editor-backdrop{align-items:flex-end}","height:min(92dvh,880px)","border-radius:var(--radius-large) var(--radius-large) 0 0"])
  must(netWorth.includes(token),`Patrimonio perdió su editor bottom-sheet responsive: ${token}`);

for(const token of [
  ".budget-modal-backdrop,.forecast-editor-backdrop,.goals-modal-backdrop,.rules-modal-backdrop{position:fixed;z-index:120;inset:0;display:grid;place-items:center;padding:24px;overflow:auto;overscroll-behavior:contain",
  ".budget-modal,.forecast-editor,.goals-modal,.rules-modal{max-width:100%;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;border:1px solid var(--border-default);border-radius:var(--radius-large);background:var(--surface-elevated);box-shadow:var(--shadow-overlay)}",
  ".budget-modal-head,.forecast-editor-head,.goals-modal-head,.rules-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}",
  "@media(max-width:680px){.budget-modal-backdrop,.forecast-editor-backdrop,.goals-modal-backdrop{align-items:end;padding:0}",
  ".budget-modal,.forecast-editor,.goals-modal{width:100%;max-height:94dvh;border-inline:0;border-bottom:0;border-radius:var(--radius-large) var(--radius-large) 0 0}",
]) must(editorDialogCss.includes(token),`La superficie compartida de editores perdió una primitiva: ${token}`);
const editorRoutes=[
  ["Presupuesto",budgetLayout,budgetCss,'import "../budget.css";',"budget-modal-backdrop"],
  ["Previsión",forecastLayout,forecastCss,'import "../forecast.css";',"forecast-editor-backdrop"],
  ["Objetivos",goalsLayout,goalsCss,'import "../goals.css";',"goals-modal-backdrop"],
  ["Reglas",rulesLayout,rulesCss,'import "../rules.css";',"rules-modal-backdrop"],
];
for(const [name,routeLayout,localCss,localImport,backdropClass] of editorRoutes){
  const sharedImport='import "../editor-dialog.css";';
  must(routeLayout.includes(sharedImport),`${name}: falta editor-dialog.css route-scoped`);
  must(routeLayout.indexOf(sharedImport)>=0&&routeLayout.indexOf(sharedImport)<routeLayout.indexOf(localImport),`${name}: editor-dialog.css debe cargarse antes del CSS local`);
  must(!new RegExp(`\\.${backdropClass}\\{[^}]*position:fixed`).test(localCss),`${name}: no debe volver a duplicar la geometría fija del backdrop`);
  must(!localCss.includes("box-shadow:var(--shadow-overlay)"),`${name}: la sombra/superficie del editor pertenece a editor-dialog.css`);
}
must(budgetCss.includes(".budget-modal{width:min(100%,620px);max-height:min(90dvh,820px);padding:22px}"),"Presupuesto debe conservar dimensiones propias sobre la base compartida");
must(forecastCss.includes(".forecast-editor{width:min(760px,100%);max-height:min(88dvh,820px);padding:22px}"),"Previsión debe conservar dimensiones propias sobre la base compartida");
must(goalsCss.includes(".goals-modal{width:min(720px,100%);max-height:min(90dvh,840px);padding:22px}"),"Objetivos debe conservar dimensiones propias sobre la base compartida");
must(rulesCss.includes(".rules-modal{width:min(960px,100%);max-height:min(90dvh,860px)}"),"Reglas debe conservar dimensiones propias sobre la base compartida");
must(rulesCss.includes(".rules-modal-head{position:sticky;top:0;z-index:2")&&rulesCss.includes(".rules-modal-actions{position:sticky;bottom:0;z-index:2"),"Reglas debe conservar cabecera y acciones sticky del editor largo");

must(dashboard.includes("24 gráficos e informes rápidos"),"El panel debe conservar el contrato visible de 24 gráficos");
const defaultOrder=dashboard.match(/const DEFAULT_ORDER:ChartId\[\]=\[([\s\S]*?)\];/)?.[1]||"";
const chartIds=[...defaultOrder.matchAll(/"([a-z0-9-]+)"/g)].map(match=>match[1]);
must(chartIds.length===24,`DEFAULT_ORDER debe conservar 24 gráficos; detectados ${chartIds.length}`);
must(new Set(chartIds).size===24,"DEFAULT_ORDER no debe contener gráficos duplicados");

must(versionAtLeast("6.5.0","6.4.11"),"Comparador semver falla en 6.5.0 >= 6.4.11");
must(versionAtLeast("7.0.0","6.4.11"),"Comparador semver falla entre familias mayores");
must(!versionAtLeast("6.4.10","6.4.11"),"Comparador semver acepta una versión inferior");
must(!versionAtLeast("bad","6.4.11"),"Comparador semver acepta una versión inválida");

const historical=["v640","v641","v642","v643","v644","v645","v646","v647","v648","v649","v6410","v6411"];
for(const suffix of historical){
  const source=read(`scripts/audit-release-${suffix}.mjs`);
  must(source.includes('from "./lib/version-baseline.mjs"'),`Gate ${suffix} no usa comparador semver compartido`);
  must(source.includes("versionAtLeast(currentVersion"),`Gate ${suffix} no valida su baseline con versionAtLeast`);
  must(!source.includes("^6\\.4\\."),`Gate ${suffix} conserva bloqueo regex a 6.4.x`);
  must(!source.includes("major===6&&minor===4"),`Gate ${suffix} conserva bloqueo imperativo a 6.4.x`);
}

const loadingBytes=fs.statSync("app/route-loading.css").size;
const tokenBytes=fs.statSync("app/analisis/chart-tokens.css").size;
const chartBytes=fs.statSync("app/cash-flow-chart.css").size;
const detailDialogBytes=fs.statSync("app/detail-dialog.css").size;
const editorDialogBytes=fs.statSync("app/editor-dialog.css").size;
must(loadingBytes<3292,`route-loading.css debe ser menor que el antiguo visual.css de 3292 bytes; detectados ${loadingBytes}`);

if(failures.length){
  console.error("Financial App 6.5.0 visual runtime audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Financial App 6.5.0 visual runtime audit OK · Home sin paneles redundantes · visual.css global retirado · skeleton ${loadingBytes} bytes · tokens ${tokenBytes} · gráfica ${chartBytes} · cajón compartido ${detailDialogBytes} con Patrimonio responsive · editores compartidos ${editorDialogBytes} · Movimientos single-render responsive · pintura diferida y ownership CSS protegidos · 24 gráficos preservados`);
