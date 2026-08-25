import fs from "node:fs";

const failures=[];
const read=file=>fs.readFileSync(file,"utf8");
const page=read("app/analisis/page.tsx");
const dashboard=read("components/analysis-visual-dashboard.tsx");
const css=read("app/analysis.css");

for(const token of ["AnalysisVisualDashboard","analysis-insight-grid"]){
  if(!page.includes(token))failures.push(`Análisis ha perdido la integración visual: ${token}`);
}
for(const token of [
  "Gráficos e informes rápidos",'"monthly-flow"','"net-trend"','"savings-rate"','"cumulative-net"','"category-donut"','"category-bars"','"merchant-bars"','"year-compare"','"deviations"','"monthly-heatmap"',
  "Personalizar gráficos","Restablecer","localStorage","draggable","Informes rápidos","Último mes cerrado","Media últimos 3 meses"
]){
  if(!dashboard.includes(token))failures.push(`Dashboard visual incompleto: ${token}`);
}
const chartFamilies=["analysis-bar-chart","analysis-svg-chart","analysis-donut","analysis-ranking-bars","analysis-year-bars","analysis-deviation-bars","analysis-heatmap"];
for(const selector of chartFamilies){if(!css.includes(`.${selector}`))failures.push(`Falta familia visual ${selector}`);}
if((dashboard.match(/case \"/g)||[]).length<10)failures.push("Análisis debe conservar al menos 10 visualizaciones configurables");
if(!css.includes("@media(max-width:680px)"))failures.push("Dashboard visual sin adaptación móvil explícita");

if(failures.length){
  console.error("AXIOMA visual analysis audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("AXIOMA visual analysis audit OK · 10 visualizaciones, informes rápidos, personalización persistente, reordenación y responsive protegidos");
