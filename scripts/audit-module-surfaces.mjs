import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

const shared=read("app/module-surfaces.css");
for(const token of [
  ".module-toolbar,.goals-toolbar,.rules-toolbar,.control-toolbar{",
  ".module-panel,.budget-panel,.goals-panel,.rules-panel,.control-panel{",
  ".module-panel-head,.budget-panel-head,.goals-panel-head,.rules-panel-head,.control-panel-head{",
  ".module-empty,.budget-empty,.goals-empty,.rules-empty,.control-empty{",
  ".module-feedback{margin:0}",
  "@media(max-width:680px)",
]) must(shared.includes(token),`Superficies compartidas incompletas: ${token}`);

const routeContracts=[
  ["Presupuesto","app/presupuesto/layout.tsx",'import "../budget.css";'],
  ["Objetivos","app/objetivos/layout.tsx",'import "../goals.css";'],
  ["Reglas","app/reglas/layout.tsx",'import "../rules.css";'],
  ["Control","app/control/layout.tsx",'import "../control.css";'],
];
for(const [name,file,localImport] of routeContracts){
  const layout=read(file);const sharedImport='import "../module-surfaces.css";';
  must(layout.includes(sharedImport),`${name} debe cargar module-surfaces.css`);
  must(layout.indexOf(sharedImport)>=0&&layout.indexOf(sharedImport)<layout.indexOf(localImport),`${name} debe cargar la base compartida antes de su CSS local`);
}
must(!read("app/prevision/layout.tsx").includes("module-surfaces.css"),"Previsión no debe cargar module-surfaces.css si no consume esas superficies");

const localCssContracts=[
  ["Presupuesto","app/budget.css",[".budget-panel{",".budget-panel-head{",".budget-empty{",".budget-feedback{",".budget-status{"]],
  ["Objetivos","app/goals.css",[".goals-toolbar{",".goals-panel{",".goals-panel-head{",".goals-empty{",".goals-feedback{",".goal-status{"]],
  ["Reglas","app/rules.css",[".rules-toolbar{",".rules-panel{",".rules-panel-head{",".rules-empty{",".rules-feedback{",".rule-status{"]],
  ["Control","app/control.css",[".control-toolbar{",".control-panel{",".control-panel-head{",".control-empty{",".control-feedback{",".severity-badge",".alert-state{",".close-status",".text-link{"]],
];
for(const [name,file,forbidden] of localCssContracts){const css=read(file);for(const token of forbidden)must(!css.includes(token),`${name} ha recuperado una superficie/estado legacy: ${token}`);}

const budget=read("app/presupuesto/budget-client.tsx");
for(const token of [
  'type Feedback={tone:"success"|"error";message:string}',
  'className={`inline-alert ${feedback.tone} module-feedback`}',
  'className={`status-badge ${statusTone[item.status]}`}',
  'aria-busy={loading?"true":undefined}',
  'e.target===e.currentTarget&&!loading',
]) must(budget.includes(token),`Presupuesto ha perdido contrato canónico: ${token}`);
for(const legacy of ["budget-feedback","budget-status"]) must(!budget.includes(legacy),`Presupuesto ha recuperado clase legacy ${legacy}`);

const goals=read("app/objetivos/goals-client.tsx");
for(const token of [
  'type Feedback={tone:"success"|"error";message:string}',
  'className={`inline-alert ${feedback.tone} module-feedback`}',
  'className={`status-badge ${statusTone[goal.status]}`}',
  'aria-busy={loading?"true":undefined}',
  'e.target===e.currentTarget&&!loading',
]) must(goals.includes(token),`Objetivos ha perdido contrato canónico: ${token}`);
for(const legacy of ["goals-feedback","goal-status"]) must(!goals.includes(legacy),`Objetivos ha recuperado clase legacy ${legacy}`);

const rules=read("app/reglas/rules-client.tsx");
for(const token of [
  'type Feedback={tone:"success"|"error"|"info";message:string}',
  'className={`inline-alert ${feedback.tone} module-feedback`}',
  'className={`status-badge ${rule.active?"ok":"muted"}`}',
  'className="text-button button-link"',
  'aria-busy={loading?"true":undefined}',
]) must(rules.includes(token),`Reglas ha perdido contrato canónico: ${token}`);
for(const legacy of ["rules-feedback","rule-status",'className="text-link"']) must(!rules.includes(legacy),`Reglas ha recuperado clase legacy ${legacy}`);

const control=read("app/control/control-client.tsx");
for(const token of [
  'type Feedback={tone:"success"|"error"|"warning";message:string}',
  'className={`inline-alert ${feedback.tone} module-feedback`}',
  'className={`status-badge ${severityTone[alert.severity]}`}',
  'className={`status-badge ${stateTone[alert.state]}`}',
  'className="text-button button-link"',
  'className="control-empty compact"',
  'aria-busy={loading?"true":undefined}',
]) must(control.includes(token),`Control ha perdido contrato canónico: ${token}`);
for(const legacy of ["control-feedback","severity-badge","alert-state","close-status",'className="text-link"']) must(!control.includes(legacy),`Control ha recuperado clase legacy ${legacy}`);

if(failures.length){console.error("Module surfaces audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log("Module surfaces audit OK · toolbars/paneles/vacíos compartidos · feedback y badges canónicos · CSS limitado a Presupuesto/Objetivos/Reglas/Control");
