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
  "app/globals.css","app/typography.css","app/controls.css","app/chrome.css","app/home.css","app/movements.css",
  "app/accounts.css","app/plan.css","app/cash-flow.css","app/budget.css","app/forecast.css","app/net-worth.css",
  "app/control.css","app/goals.css","app/rules.css","app/archive.css","app/archive-review.css","app/document-linking.css",
  "app/settings.css","app/analysis.css","app/analysis-visual-wall.css","app/analysis-interactions.css",
  "app/intelligence.css","app/reconciliation.css","app/explicabilidad/explainability.css"
];
for(const file of redesigned){if(!fs.existsSync(file))failures.push(`Falta hoja de producto: ${file}`);}

const globals=fs.readFileSync("app/globals.css","utf8");
for(const legacy of ["--shadow:","--surface-soft:","--surface-strong:","#0b4f8a","#4c9bff"]){if(globals.includes(legacy))failures.push(`globals.css recupera identidad/token retirado: ${legacy}`);}
for(const token of [
  "--background-primary:","--background-secondary:","--background-tertiary:",
  "--surface-primary:","--surface-secondary:","--surface-elevated:","--surface-hover:","--surface-selected:",
  "--border-subtle:","--border-default:","--border-strong:","--border-selected:",
  "--text-primary:","--text-secondary:","--text-tertiary:","--text-disabled:","--text-inverse:",
  "--gold-primary:","--gold-light:","--gold-dark:","--gold-muted:","--gold-hover:","--gold-active:",
  "--positive:","--positive-muted:","--negative:","--negative-muted:","--warning:","--info:","--pending:","--neutral:",
  "--focus:","--selection:","--interaction-hover:","--interaction-pressed:","--interaction-disabled:",
  "--radius-small:","--radius-medium:","--radius-large:","--radius-full:",
  "--space-1:4px","--space-2:8px","--space-3:12px","--space-4:16px","--space-5:20px","--space-6:24px","--space-8:32px","--space-10:40px","--space-12:48px",
  "--font-xs:14px","--font-sm:15px","--font-md:16px","--motion-micro:150ms","--motion-panel:220ms"
]){if(!globals.includes(token))failures.push(`globals.css ha perdido el contrato semántico: ${token}`);}

const layout=fs.readFileSync("app/layout.tsx","utf8");
const globalsImport='import "./globals.css";';
const typographyImport='import "./typography.css";';
const controlsImport='import "./controls.css";';
const chromeImport='import "./chrome.css";';
for(const token of [globalsImport,typographyImport,controlsImport,chromeImport])if(!layout.includes(token))failures.push(`layout.tsx debe cargar ${token}`);
if(layout.indexOf(typographyImport)<layout.indexOf(globalsImport))failures.push("typography.css debe consumir los tokens de globals.css");
if(layout.indexOf(typographyImport)>layout.indexOf(controlsImport)||layout.indexOf(typographyImport)>layout.indexOf(chromeImport))failures.push("typography.css debe ser una base temprana, no una capa correctiva final");

const typography=fs.readFileSync("app/typography.css","utf8");
for(const token of ["--type-metadata:14px","--type-secondary:15px","--type-copy:16px","--type-section:21px","--type-page:clamp(28px,2.6vw,36px)","--type-financial:","font-variant-numeric:tabular-nums"]){if(!typography.includes(token))failures.push(`typography.css ha perdido la escala base: ${token}`);}
for(const forbidden of [".movement-",".forecast-",".plan-",".home-","[class*=",".mobile-nav",".app-root.private .app-route"]){if(typography.includes(forbidden))failures.push(`typography.css ha vuelto a ser una capa de rescate específica: ${forbidden}`);}

for(const file of redesigned){
  const css=fs.readFileSync(file,"utf8");
  for(const match of css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)){
    const size=Number(match[1]);
    if(size>0&&size<14)failures.push(`${file}: tamaño relevante inferior a 14px (${size}px)`);
  }
}

if(failures.length){console.error("Visual debt audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log(`Visual debt audit OK · ${cssFiles.length} hojas CSS sin !important, ${redesigned.length} superficies reformadas protegidas y tipografía sin microtexto`);
