import fs from "node:fs";
import path from "node:path";

const failures=[];
const cssFiles=[];
function walk(dir){
  if(!fs.existsSync(dir))return;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(entry.name.endsWith(".css"))cssFiles.push(full.replaceAll("\\","/"));
  }
}
walk("app");

for(const file of cssFiles){
  const css=fs.readFileSync(file,"utf8");
  if(css.includes("!important"))failures.push(`${file}: contiene !important`);
  if(css.includes("var(--shadow)"))failures.push(`${file}: usa el token de sombra legado var(--shadow)`);
  if(css.includes("--surface-soft")||css.includes("--surface-strong")||css.includes("var(--surface-soft)")||css.includes("var(--surface-strong)"))failures.push(`${file}: conserva variables de superficie retiradas`);
}

const redesigned=[
  "app/globals.css","app/controls.css","app/chrome.css","app/home.css","app/movements.css","app/accounts.css","app/plan.css","app/cash-flow.css","app/budget.css","app/forecast.css","app/net-worth.css","app/control.css","app/goals.css","app/rules.css","app/archive.css","app/settings.css","app/analysis.css","app/analysis-visual-wall.css","app/analysis-interactions.css","app/explicabilidad/explainability.css"
];
for(const file of redesigned){if(!fs.existsSync(file))failures.push(`Falta hoja rediseñada: ${file}`);}

const globals=fs.readFileSync("app/globals.css","utf8");
for(const legacy of ["--shadow:","--surface-soft:","--surface-strong:"]){if(globals.includes(legacy))failures.push(`globals.css recupera token retirado: ${legacy}`);}
for(const token of ["--shadow-float:","--radius-control:9px","--radius-overlay:16px","--expense:#a64b43","--success:#2d715f"]){if(!globals.includes(token))failures.push(`globals.css ha perdido el token canónico: ${token}`);}

if(failures.length){
  console.error("Visual debt audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Visual debt audit OK · ${cssFiles.length} hojas CSS activas sin !important, shadow legado ni variables huérfanas`);
