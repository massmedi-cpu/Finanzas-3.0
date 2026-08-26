import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const home=read("app/page.tsx");
const cashFlowLayout=read("app/cash-flow/layout.tsx");
const rootLayout=read("app/layout.tsx");
const chart=read("components/cash-flow-chart.tsx");
const css=read("app/cash-flow.css");
const visual=read("app/visual.css");
const globals=read("app/globals.css");

const checks=[
  [home.includes('import "./cash-flow.css"'),"Inicio debe cargar los estilos del gráfico que renderiza"],
  [cashFlowLayout.includes('import "../cash-flow.css"'),"Cash Flow debe cargar su hoja canónica en su layout"],
  [!rootLayout.includes("cash-flow.css"),"Cash Flow no debe contaminar el layout raíz"],
  [!fs.existsSync("app/cash-flow-advanced.css"),"La antigua capa cash-flow-advanced.css no debe reaparecer"],
  [chart.includes("padLeft=86")&&chart.includes("padRight=86"),"el gráfico debe reservar espacio para ambos ejes"],
  [chart.includes("Ingresos / gastos")&&chart.includes("Acumulado"),"los dos ejes deben estar identificados"],
  [chart.includes("cf-grid")&&chart.includes("cf-acc-zero"),"deben existir grid y referencia cero del acumulado"],
  [chart.includes("const accMid=")&&chart.includes("const accY="),"el acumulado debe usar escala independiente"],
  [css.includes(".cf-chart .cf-acc-line{fill:none")&&visual.includes(".app-root .cf-acc-line{stroke:var(--chart-accent);fill:none}"),"la serie acumulada nunca puede rellenar área"],
  [visual.includes("--chart-income:var(--success)")&&visual.includes(".app-root .cf-income{fill:var(--chart-income)}")&&css.includes(".cf-income{fill:var(--chart-income,var(--success))}"),"Ingresos debe usar color semántico"],
  [visual.includes("--chart-expense:var(--expense)")&&visual.includes(".app-root .cf-expense{fill:var(--chart-expense)}")&&globals.includes("--expense:#a64b43")&&globals.includes("--expense:#df8a82"),"Gastos debe mantener contraste claro/oscuro mediante el token semántico"],
  [css.includes(".cf-series-controls")&&visual.includes(".app-root .cf-series-controls .expense{background:var(--chart-expense)}"),"los controles de series deben conservar estilos accesibles dentro del sistema canónico"],
  [!css.includes("!important"),"Cash Flow no debe recuperar overrides !important"],
];

const failures=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failures.length){
  console.error("Audit 2.8.1 FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Audit 2.8.1 OK · CSS canónico acotado, tokens semánticos claro/oscuro, doble eje y acumulado sin relleno protegidos");
