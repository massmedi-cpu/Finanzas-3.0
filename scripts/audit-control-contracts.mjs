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
  const source=read(file);
  for(const retired of ["secondary-action","danger-button"]){
    if(source.includes(retired))failures.push(`${file} usa la clase de control retirada ${retired}`);
  }
  if(source.includes("text-button")&&file!=="app/reglas/rules-client.tsx"&&file!=="app/rules.css"){
    failures.push(`${file} usa text-button fuera del módulo propietario de Reglas`);
  }
}

const rulesCss=read("app/rules.css");
if(!rulesCss.includes(".rule-actions .text-button{"))failures.push("rules.css debe poseer explícitamente el control local .rule-actions .text-button");
const rulesClient=read("app/reglas/rules-client.tsx");
if(rulesClient.includes('className="text-button"')&&!rulesCss.includes(".rule-actions .text-button{"))failures.push("Reglas usa text-button sin estilo local propietario");

const explainability=read("app/explicabilidad/explainability-client.tsx");
for(const token of ['className="ghost"','className="primary-action"','Comprobar qué detectará','Activar para futuros']){
  if(!explainability.includes(token))failures.push(`Explicabilidad ha perdido el contrato de control/claridad: ${token}`);
}

if(failures.length){
  console.error("Control usage audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Control usage audit OK · controles compartidos canónicos y controles locales con propietario explícito");
