import fs from "node:fs";

const read=(path)=>fs.readFileSync(path,"utf8");
const layout=read("app/layout.tsx");
const chart=read("components/cash-flow-chart.tsx");
const css=read("app/cash-flow.css");
const advanced=read("app/cash-flow-advanced.css");

const checks=[
  [layout.includes('import "./cash-flow.css"'),"cash-flow.css debe cargarse globalmente para Inicio y Cash Flow"],
  [layout.includes('import "./cash-flow-advanced.css"'),"cash-flow-advanced.css debe cargarse globalmente"],
  [chart.includes("padLeft=86")&&chart.includes("padRight=86"),"el gráfico debe reservar espacio para ambos ejes"],
  [chart.includes("Ingresos / gastos")&&chart.includes("Acumulado"),"los dos ejes deben estar identificados"],
  [chart.includes("cf-grid")&&chart.includes("cf-acc-zero"),"deben existir grid y referencia cero del acumulado"],
  [chart.includes("const accMid=")&&chart.includes("const accY="),"el acumulado debe usar escala independiente"],
  [css.includes(".cf-acc-line{fill:none!important"),"la serie acumulada nunca puede rellenar área"],
  [css.includes(".cf-income{fill:var(--success)}"),"Ingresos debe usar color semántico"],
  [css.includes(".cf-expense{fill:#c94848}")&&css.includes("#ff7b72"),"Gastos debe mantener contraste claro/oscuro"],
  [advanced.includes(".cf-series-controls"),"los controles de series deben conservar estilos accesibles"],
];

const failures=checks.filter(([ok])=>!ok).map(([,message])=>message);
if(failures.length){
  console.error("Audit 2.8.1 FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Audit 2.8.1 OK · estilos globales, contraste, doble eje y acumulado sin relleno protegidos");
