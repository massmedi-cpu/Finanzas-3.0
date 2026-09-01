import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const rootLayout=read("app/layout.tsx");
const homePage=read("app/page.tsx");
const archiveLayout=read("app/archivo/layout.tsx");
const movementsLayout=read("app/movimientos/layout.tsx");
const homeSource=read("app/home.css");
const archiveReviewSource=read("app/archive-review.css");
const homeCss=Buffer.byteLength(homeSource);
const archiveReviewCss=Buffer.byteLength(archiveReviewSource);
const linkingGlobal=rootLayout.includes('import "./document-linking.css";');
const linkingScoped=archiveLayout.includes('import "../document-linking.css";')&&movementsLayout.includes('import "../document-linking.css";');

must(!rootLayout.includes('"./home.css"'),"home.css no debe cargarse desde el layout raíz");
must(!rootLayout.includes('"./archive-review.css"'),"archive-review.css no debe cargarse desde el layout raíz");
must(homePage.includes('import "./home.css";'),"Inicio debe cargar home.css de forma local");
must(archiveLayout.includes('import "../archive-review.css";'),"Archivo debe cargar archive-review.css desde su layout");
must(linkingGlobal||linkingScoped,"document-linking.css debe seguir disponible para Archivo y Movimientos");
for(const token of [".home-workspace{",".home-month-pulse{",".home-flow-section",".home-decision-grid{"])
  must(homeSource.includes(token),`home.css ha perdido estructura local relevante: ${token}`);
for(const token of [".archive-review-workspace",".triage-"])
  must(archiveReviewSource.includes(token),`archive-review.css ha perdido estructura local relevante: ${token}`);
must(homeCss>0&&archiveReviewCss>0,"Las hojas route-scoped no pueden quedar vacías");

if(failures.length){
  console.error("Financial App 6.4.9 CSS scope audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Financial App 6.4.9 CSS scope audit OK · ${homeCss+archiveReviewCss} bytes de CSS específico permanecen fuera del layout raíz sin umbral que penalice limpieza`);
