import fs from "node:fs";
import path from "node:path";

const roots=["app","components"];
const extensions=new Set([".ts",".tsx",".js",".mjs",".css"]);
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(extensions.has(path.extname(entry.name)))files.push(full.replaceAll("\\","/"));}}
for(const root of roots)walk(root);

const failures=[];
const read=file=>fs.readFileSync(file,"utf8");
for(const file of files){if(read(file).includes("secondary-action"))failures.push(`${file} usa la clase de control huérfana secondary-action`);}

const localContracts=[
  {token:"text-button",clients:["app/reglas/rules-client.tsx"],css:"app/rules.css",selector:".rule-actions .text-button{",label:"Reglas"},
  {token:"text-button",clients:["app/presupuesto/budget-client.tsx"],css:"app/budget.css",selector:".text-button{",label:"Presupuesto"},
  {token:"danger-button",clients:["app/presupuesto/budget-client.tsx"],css:"app/budget.css",selector:".danger-button{",label:"Presupuesto"},
  {token:"text-button",clients:["app/control/control-client.tsx"],css:"app/control.css",selector:".text-link,.text-button{",label:"Control"},
  {token:"text-button",clients:["app/objetivos/goals-client.tsx"],css:"app/goals.css",selector:".text-button{",label:"Objetivos"},
  {token:"danger-button",clients:["app/objetivos/goals-client.tsx"],css:"app/goals.css",selector:".danger-button{",label:"Objetivos"},
];

for(const contract of localContracts){const css=read(contract.css);if(!css.includes(contract.selector))failures.push(`${contract.label} usa ${contract.token} sin estilo local propietario en ${contract.css}`);}
for(const token of ["text-button","danger-button"]){const allowed=new Set(localContracts.filter(contract=>contract.token===token).flatMap(contract=>[...contract.clients,contract.css]));for(const file of files){if(read(file).includes(token)&&!allowed.has(file))failures.push(`${file} usa ${token} sin contrato de propiedad declarado`);}}

const controls=read("app/controls.css");
const iconRules=[...controls.matchAll(/\.icon-button\{([^}]*)\}/g)].map(match=>match[1]).join(";");
for(const token of ["border:","background:","color:","border-radius:","padding:"]){if(!iconRules.includes(token))failures.push(`icon-button canónico incompleto: falta ${token}`);}
const analysisDashboard=read("components/analysis-visual-dashboard.tsx");
const analysisPeriod=read("components/analysis-period-form.tsx");
for(const token of ['className="icon-button"','className="ghost"']){if(!analysisDashboard.includes(token))failures.push(`Análisis ha perdido control canónico: ${token}`);}
if(!analysisPeriod.includes('className="primary-action"'))failures.push("Selector de periodo ha perdido el botón primario canónico");

const explainability=read("app/explicabilidad/explainability-client.tsx");
for(const token of ['className="ghost"','className="primary-action"','Comprobar qué detectará','Activar para futuros']){if(!explainability.includes(token))failures.push(`Explicabilidad ha perdido el contrato de control/claridad: ${token}`);}

const chrome=read("app/chrome.css");
const navigation=read("components/app-navigation.tsx");
for(const token of [
  ".product-nav{",
  "position:sticky",
  ".product-primary-nav{",
  ".product-more-menu{",
  "@media(max-width:680px)",
  ".mobile-nav{position:fixed",
  "bottom:0",
  "env(safe-area-inset-bottom,0px)",
  "overflow-x:clip"
]){if(!chrome.includes(token))failures.push(`Shell adaptable incompleto: falta ${token}`);}
for(const token of ["mobilePrimary","mobile-nav","product-more-menu","Más",'aria-expanded={moreOpen}','aria-controls="product-more-menu"']){if(!navigation.includes(token))failures.push(`Navegación adaptable incompleta: falta ${token}`);}
if(chrome.includes(".sidebar")||navigation.includes("AppSidebar"))failures.push("El shell ha recuperado la sidebar SaaS retirada");

if(failures.length){console.error("Control usage audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Control usage audit OK · controles canónicos completos, navegación de producto adaptable y sin clases huérfanas");
