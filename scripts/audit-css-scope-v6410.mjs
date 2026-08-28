import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const rootLayout=read("app/layout.tsx");
const archiveLayout=read("app/archivo/layout.tsx");
const movementsLayout=read("app/movimientos/layout.tsx");
const linkingCss=read("app/document-linking.css");
const linkingBytes=fs.statSync("app/document-linking.css").size;

must(!rootLayout.includes('document-linking.css'),"document-linking.css no debe cargarse desde el layout raíz");
must(archiveLayout.includes('import "../document-linking.css";'),"Archivo debe cargar document-linking.css desde su layout");
must(movementsLayout.includes('import "../document-linking.css";'),"Movimientos debe cargar document-linking.css desde su layout");
must(linkingBytes>=2000,`El aislamiento debe retirar al menos 2 KB del ámbito raíz; detectados ${linkingBytes} bytes`);
must(linkingCss.includes(".archive-manual-link"),"document-linking.css debe conservar la superficie de Archivo");
must(linkingCss.includes(".movement-documents"),"document-linking.css debe conservar la superficie de Movimientos");

if(failures.length){
  console.error("Financial App 6.4.10 CSS shared-scope audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Financial App 6.4.10 CSS shared-scope audit OK · ${linkingBytes} bytes dejan de cargarse fuera de Archivo/Movimientos`);
