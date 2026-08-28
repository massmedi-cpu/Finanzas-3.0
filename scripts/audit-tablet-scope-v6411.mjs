import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const rootTablet=read("app/tablet.css");
const movementsTablet=read("app/movimientos/tablet.css");
const archiveTablet=read("app/archivo/tablet.css");
const movementsLayout=read("app/movimientos/layout.tsx");
const archiveLayout=read("app/archivo/layout.tsx");
const home=read("app/page.tsx");
const rootBytes=fs.statSync("app/tablet.css").size;

for(const token of [".detail-loading",".movement-drawer",".movement-table-wrap",".movement-filters",".movements-workspace",".archive-toolbar",".archive-import-actions",".archive-workspace",".home-top-actions"]){
  must(!rootTablet.includes(token),`tablet.css raíz conserva selector específico: ${token}`);
}
for(const token of [".workspace",".topbar",".route-loading-v300",".editor-actions","scroll-margin-top:78px"]){
  must(rootTablet.includes(token),`tablet.css raíz perdió contrato compartido: ${token}`);
}
must(rootBytes<=400,`tablet.css raíz debe quedar en <=400 bytes; detectados ${rootBytes}`);
must(!rootTablet.includes("!important"),"tablet.css raíz no debe introducir !important");

for(const token of [".detail-loading",".movement-drawer",".movement-table-wrap",".movement-filters",".movements-workspace"]){
  must(movementsTablet.includes(token),`Movimientos perdió regla tablet: ${token}`);
}
for(const token of [".archive-toolbar",".archive-import-actions",".archive-workspace"]){
  must(archiveTablet.includes(token),`Archivo perdió regla tablet: ${token}`);
}
must(movementsLayout.includes('import "./tablet.css";'),"Movimientos debe cargar su tablet.css local");
must(archiveLayout.includes('import "./tablet.css";'),"Archivo debe cargar su tablet.css local");
must(movementsLayout.indexOf('import "./tablet.css";')<movementsLayout.indexOf('import "../movements.css";'),"Movimientos debe mantener el orden de cascada tablet -> hoja principal");
must(archiveLayout.indexOf('import "./tablet.css";')<archiveLayout.indexOf('import "../archive.css";'),"Archivo debe mantener el orden de cascada tablet -> hoja principal");
must(home.includes('className="home-masthead"')&&home.includes('className="home-top-actions"'),"Inicio debe conservar masthead y acciones actuales");
must(!rootTablet.includes(".topbar .home-top-actions"),"No debe volver la regla muerta .topbar .home-top-actions");
must(!movementsTablet.includes("!important")&&!archiveTablet.includes("!important"),"El aislamiento tablet no debe introducir !important");

if(failures.length){
  console.error("Financial App 6.4.11 tablet scope audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Financial App 6.4.11 tablet scope audit OK · tablet.css raíz ${rootBytes} bytes · reglas específicas aisladas por ruta`);
