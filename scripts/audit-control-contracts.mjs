import fs from "node:fs";
import path from "node:path";

const roots=["app","components"];
const extensions=new Set([".ts",".tsx",".js",".mjs",".css"]);
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(extensions.has(path.extname(entry.name)))files.push(full.replaceAll("\\","/"));}}
for(const root of roots)walk(root);

const failures=[];
const read=file=>fs.readFileSync(file,"utf8");
for(const file of files){
  if(read(file).includes("secondary-action"))failures.push(`${file} usa la clase de control huérfana secondary-action`);
}

const localContracts=[
  {token:"text-button",clients:["app/reglas/rules-client.tsx"],css:"app/rules.css",selector:".rule-actions .text-button{"},label:"Reglas"},
  {token:"text-button",clients:["app/presupuesto/budget-client.tsx"],css:"app/budget.css",selector:".text-button{"},label:"Presupuesto"},
  {token:"danger-button",clients:["app/presupuesto/budget-client.tsx"],css:"app/budget.css",selector:".danger-button{"},label:"Presupuesto"},
  {token:"text-button",clients:["app/control/control-client.tsx"],css:"app/control.css",selector:".text-link,.text-button{"},label:"Control"},
  {token:"text-button",clients:["app/objetivos/goals-client.tsx"],css:"app/goals.css",selector:".text-button{"},label:"Objetivos"},
  {token:"danger-button",clients:["app/objetivos/goals-client.tsx"],css:"app/goals.css",selector:".danger-button{"},label:"Objetivos"},
];

for(const contract of localContracts){
  const css=read(contract.css);
  if(!css.includes(contract.selector))failures.push(`${contract.label} usa ${contract.token} sin estilo local propietario en ${contract.css}`);
}
for(const token of ["text-button","danger-button"]){
  const allowed=new Set(localContracts.filter(contract=>contract.token===token).flatMap(contract=>[...contract.clients,contract.css]));
  for(const file of files){if(read(file).includes(token)&&!allowed.has(file))failures.push(`${file} usa ${token} sin contrato de propiedad declarado`);}
}

const explainability=read("app/explicabilidad/explainability-client.tsx");
for(const token of ['className="ghost"','className="primary-action"','Comprobar qué detectará','Activar para futuros']){
  if(!explainability.includes(token))failures.push(`Explicabilidad ha perdido el contrato de control/claridad: ${token}`);
}

if(failures.length){
  console.error("Control usage audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Control usage audit OK · sin controles huérfanos y con propiedad explícita para variantes locales");
