import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const rootLayout=read("app/layout.tsx");
const homePage=read("app/page.tsx");
const archiveLayout=read("app/archivo/layout.tsx");
const homeCss=fs.statSync("app/home.css").size;
const archiveReviewCss=fs.statSync("app/archive-review.css").size;

must(!rootLayout.includes('"./home.css"'),"home.css no debe cargarse desde el layout raíz");
must(!rootLayout.includes('"./archive-review.css"'),"archive-review.css no debe cargarse desde el layout raíz");
must(homePage.includes('import "./home.css";'),"Inicio debe cargar home.css de forma local");
must(archiveLayout.includes('import "../archive-review.css";'),"Archivo debe cargar archive-review.css desde su layout");
must(rootLayout.includes('import "./document-linking.css";'),"document-linking.css debe seguir global mientras lo comparten Archivo y Movimientos");
must(homeCss+archiveReviewCss>=11000,`El aislamiento esperado debe sacar al menos 11 KB del ámbito raíz; detectados ${homeCss+archiveReviewCss} bytes`);

if(failures.length){
  console.error("Financial App 6.4.9 CSS scope audit FAILED");
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Financial App 6.4.9 CSS scope audit OK · ${homeCss+archiveReviewCss} bytes de CSS específico fuera del layout raíz`);
