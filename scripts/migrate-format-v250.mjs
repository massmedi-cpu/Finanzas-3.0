import{readFileSync,writeFileSync}from"node:fs";

const normalMoney=[
"app/analisis/page.tsx","app/archivo/archive-client.tsx","app/cash-flow/page.tsx","app/control/control-client.tsx","app/cuentas/[id]/page.tsx","app/cuentas/page.tsx","app/movimientos/conciliacion/page.tsx","app/movimientos/movements-client.tsx","app/movimientos/split-editor.tsx","app/objetivos/goals-client.tsx","app/page.tsx","app/patrimonio/net-worth-client.tsx","app/plan/horizonte/page.tsx","app/plan/page.tsx","app/presupuesto/budget-client.tsx","app/prevision/forecast-client.tsx","app/prevision/scenario-simulator.tsx","app/reglas/rules-client.tsx","components/cash-flow-chart.tsx"
];
const wholeMoney=["components/balance-chart.tsx","components/net-worth-chart.tsx","lib/financial/intelligence.ts"];

function addImport(text,names){
  const line=`import { ${[...names].sort().join(", ")} } from "@/lib/format/es-es";`;
  if(text.includes('from "@/lib/format/es-es"')){
    return text.replace(/import \{([^}]+)\} from "@\/lib\/format\/es-es";/,(_,inside)=>{
      const merged=new Set([...inside.split(",").map(x=>x.trim()).filter(Boolean),...names]);
      return `import { ${[...merged].sort().join(", ")} } from "@/lib/format/es-es";`;
    });
  }
  if(text.startsWith('"use client";'))return text.replace('"use client";','"use client";\n\n'+line);
  return line+'\n'+text;
}

for(const file of normalMoney){
  let text=readFileSync(file,"utf8");
  if(!text.includes("Intl.NumberFormat"))continue;
  text=text.replace(/const money\s*=\s*new Intl\.NumberFormat\("es-ES",\s*\{\s*style\s*:\s*["']currency["'],\s*currency\s*:\s*["']EUR["']\s*\}\s*\);?/g,"");
  text=text.replace(/const money=new Intl\.NumberFormat\("es-ES",\{style:"currency",currency:"EUR"\}\);?/g,"");
  text=text.replaceAll("money.format(","formatEuro(");
  text=addImport(text,new Set(["formatEuro"]));
  writeFileSync(file,text);
}
for(const file of wholeMoney){
  let text=readFileSync(file,"utf8");
  text=text.replace(/const money\s*=\s*new Intl\.NumberFormat\("es-ES",\s*\{\s*style\s*:\s*["']currency["'],\s*currency\s*:\s*["']EUR["'],\s*maximumFractionDigits\s*:\s*0\s*\}\s*\);?/g,"");
  text=text.replace(/const money=new Intl\.NumberFormat\("es-ES",\{style:"currency",currency:"EUR",maximumFractionDigits:0\}\);?/g,"");
  text=text.replaceAll("money.format(","formatEuroInteger(");
  text=addImport(text,new Set(["formatEuroInteger"]));
  writeFileSync(file,text);
}

// Inicio: enteros y porcentajes visibles.
{
  const file="app/page.tsx";let text=readFileSync(file,"utf8");
  text=text.replace(/const number=new Intl\.NumberFormat\("es-ES"\);?/g,"");
  text=text.replaceAll("number.format(","formatInteger(");
  text=text.replace(/([A-Za-z0-9_.]+)\.toLocaleString\("es-ES",\{maximumFractionDigits:1\}\)%/g,"${formatPercent($1,1)}");
  text=addImport(text,new Set(["formatInteger","formatPercent"]));writeFileSync(file,text);
}
// Análisis: porcentajes, enteros y shares.
{
  const file="app/analisis/page.tsx";let text=readFileSync(file,"utf8");
  text=text.replace(/const pct=.*?;\n/,"const pct=(v:number|null)=>formatSignedPercent(v,1);\n");
  text=text.replace(/const plainPct=.*?;\n/,"const plainPct=(v:number|null)=>formatPercent(v,1);\n");
  text=text.replace(/data\.movements\.toLocaleString\("es-ES"\)/g,"formatInteger(data.movements)");
  text=text.replace(/c\.share\.toLocaleString\("es-ES"\) %/g,"${formatNumber(c.share,{maximumFractionDigits:1})} %");
  text=addImport(text,new Set(["formatInteger","formatNumber","formatPercent","formatSignedPercent"]));writeFileSync(file,text);
}
// Cuentas: total de movimientos.
{
  const file="app/cuentas/page.tsx";let text=readFileSync(file,"utf8");text=text.replace(/account\.movements\.toLocaleString\("es-ES"\)/g,"formatInteger(account.movements)");text=addImport(text,new Set(["formatInteger"]));writeFileSync(file,text);
}
// Movimientos: rangos y total.
{
  const file="app/movimientos/movements-client.tsx";let text=readFileSync(file,"utf8");
  text=text.replace(/first\.toLocaleString\("es-ES"\)/g,"formatInteger(first)").replace(/last\.toLocaleString\("es-ES"\)/g,"formatInteger(last)").replace(/pageData\.total\.toLocaleString\("es-ES"\)/g,"formatInteger(pageData.total)");
  text=addImport(text,new Set(["formatInteger"]));writeFileSync(file,text);
}
// Objetivos y presupuesto: porcentajes.
for(const [file,expr] of [["app/objetivos/goals-client.tsx","knownProgress"],["app/presupuesto/budget-client.tsx","item.percent"]]){
  let text=readFileSync(file,"utf8");const escaped=expr.replace(".","\\.");text=text.replace(new RegExp(`${escaped}\\.toLocaleString\\(\\"es-ES\\",\\{maximumFractionDigits:1\\}\\)%`,"g"),`\${formatPercent(${expr},1)}`);text=addImport(text,new Set(["formatPercent"]));writeFileSync(file,text);
}
// Plan: enteros.
{
  const file="app/plan/page.tsx";let text=readFileSync(file,"utf8");text=text.replace(/const number=new Intl\.NumberFormat\("es-ES"\);?/g,"").replaceAll("number.format(","formatInteger(");text=addImport(text,new Set(["formatInteger"]));writeFileSync(file,text);
}
// Horizonte: decimal máximo 1.
{
  const file="app/plan/horizonte/page.tsx";let text=readFileSync(file,"utf8");text=text.replace(/const number=new Intl\.NumberFormat\("es-ES",\{maximumFractionDigits:1\}\);?/g,"").replace(/number\.format\(horizon\.goalFundingMonths\)/g,"formatNumber(horizon.goalFundingMonths,{maximumFractionDigits:1})");text=addImport(text,new Set(["formatNumber"]));writeFileSync(file,text);
}
// Inteligencia: porcentaje y conteos en texto.
{
  const file="lib/financial/intelligence.ts";let text=readFileSync(file,"utf8");
  text=text.replace(/const pct=new Intl\.NumberFormat\("es-ES",\{maximumFractionDigits:1\}\);?/g,"");
  text=text.replace(/`\$\{trend>0\?"\+":""\}\$\{pct\.format\(trend\)\} %/g,'`${formatSignedPercent(trend,1)}');
  text=addImport(text,new Set(["formatSignedPercent"]));writeFileSync(file,text);
}

console.log("Migración de formato 2.5 aplicada");
