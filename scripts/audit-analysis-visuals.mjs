import fs from "node:fs";

const failures=[];
const read=file=>fs.readFileSync(file,"utf8");
const page=read("app/analisis/page.tsx");
const dashboard=read("components/analysis-visual-dashboard.tsx");
const periodForm=read("components/analysis-period-form.tsx");
const periodLogic=read("lib/financial/analysis-period.ts");
const analysisData=read("lib/financial/analysis.ts");
const migration=read("database/FINANCIAL_APP_3.4.8_ANALYSIS_PERIODS.sql");
const baseCss=read("app/analysis.css");
const wallCss=read("app/analysis-visual-wall.css");
const interactionCss=read("app/analysis-interactions.css");
const css=baseCss+wallCss+interactionCss;

for(const token of ["AnalysisVisualDashboard","AnalysisPeriodForm","resolveAnalysisPeriod","getAnalysisOverviewPeriod","analysis-insight-grid"]){
  if(!page.includes(token))failures.push(`Análisis ha perdido la integración de periodo/visual: ${token}`);
}
for(const token of [
  "24 gráficos e informes rápidos",
  '"monthly-flow"','"net-trend"','"income-trend"','"expense-trend"','"savings-rate"','"expense-ratio"','"cumulative-net"','"net-diverging"',
  '"income-prior"','"expense-prior"','"year-compare"','"annual-waterfall"','"rolling-expenses"','"rolling-net"','"expense-average"','"income-average"',
  '"category-donut"','"category-bars"','"category-treemap"','"category-pareto"','"merchant-bars"','"merchant-pareto"','"deviations"','"monthly-heatmap"',
  "Personalizar gráficos","Restablecer","localStorage","draggable","Informes rápidos","Último mes cerrado","Media últimos 3 meses",
  "data-chart-detail","analysis-chart-popover","analysis-chart-legend","legendFor","role=\"dialog\"","Pulsa o toca cualquier barra"
]){
  if(!dashboard.includes(token))failures.push(`Dashboard visual incompleto: ${token}`);
}
for(const token of ["Mes actual","Mes anterior","Últimos 30 días","Últimos 3 meses","Últimos 6 meses","Últimos 12 meses","1.er trimestre","Personalizado","Aplicar periodo"]){
  if(!periodForm.includes(token))failures.push(`Selector de periodo incompleto: ${token}`);
}
for(const token of ["resolveAnalysisPeriod","previous-month","last30","last3","last6","last12","custom"]){if(!periodLogic.includes(token))failures.push(`Resolución de periodos incompleta: ${token}`);}
for(const token of ["financial_app_analysis_overview_period","analysis_overview_range_core"]){if(!migration.includes(token)||!analysisData.includes(token)&&token==="financial_app_analysis_overview_period")failures.push(`Contrato de análisis por periodo ausente: ${token}`);}
const chartFamilies=["analysis-bar-chart","analysis-svg-chart","analysis-donut","analysis-ranking-bars","analysis-year-bars","analysis-deviation-bars","analysis-heatmap","analysis-diverging","analysis-average-deviation","analysis-pareto","analysis-treemap","analysis-waterfall","analysis-chart-popover","analysis-chart-legend","analysis-period-form"];
for(const selector of chartFamilies){if(!css.includes(`.${selector}`))failures.push(`Falta familia visual ${selector}`);}
if((dashboard.match(/case \"/g)||[]).length<24)failures.push("Análisis debe conservar al menos 24 visualizaciones configurables");
if((dashboard.match(/detailProps\(/g)||[]).length<18)failures.push("Los gráficos han perdido detalle interactivo suficiente");
if(!css.includes("@media(max-width:680px)"))failures.push("Dashboard visual sin adaptación móvil explícita");
for(const token of [".analysis-workspace{overflow-x:clip}",".analysis-viz-grid,.analysis-viz-grid>*{min-width:0;width:100%}",".analysis-pareto svg,.analysis-waterfall svg{min-width:0;width:100%;height:190px}",".analysis-svg-chart svg{width:100%;height:180px}"]){if(!wallCss.includes(token))failures.push(`Contrato móvil de gráficos ausente: ${token}`);}
for(const token of ["label:has(input:disabled)","max-height:min(58vh,420px)","width:min(280px,calc(100% - 24px))"]){if(!interactionCss.includes(token))failures.push(`Contrato móvil de interacción ausente: ${token}`);}
if(wallCss.includes("min-width:620px"))failures.push("Análisis móvil no puede reintroducir gráficos de 620 px que desborden la pantalla");
if(css.includes("!important"))failures.push("Análisis no puede depender de overrides !important");
for(const token of [".analysis-bar-pair .income{background:var(--chart-income)}",".analysis-bar-pair .expense{background:var(--chart-expense)}",".analysis-diverging .negative-bar{background:var(--negative)}"]){if(!css.includes(token))failures.push(`Color financiero semántico ausente: ${token}`);}

if(failures.length){
  console.error("AXIOMA visual analysis audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("AXIOMA visual analysis audit OK · 24 visualizaciones, detalle flotante, tokens semánticos, periodos globales y layout móvil sin overrides protegidos");
