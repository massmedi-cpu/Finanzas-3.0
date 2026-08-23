import{existsSync,readFileSync}from"node:fs";
const errors=[];
const required=[
  "database/FINANCIAL_APP_2.7.0_EXPLAINABILITY.sql",
  "lib/financial/classification-origin.ts",
  "lib/financial/explainability.ts",
  "app/explicabilidad/page.tsx",
  "app/explicabilidad/explainability-client.tsx",
  "app/explicabilidad/explainability.css",
  "scripts/explainability-v270-tests.ts"
];
for(const file of required)if(!existsSync(file))errors.push(`Falta ${file}`);
const read=file=>existsSync(file)?readFileSync(file,"utf8"):"";
const sql=read(required[0]).toLowerCase();
for(const token of ["stable security definer","previewrequired","minsamples","mindominance","transaction_rule_applications","transaction_splits","revoke all","grant execute"]){if(!sql.includes(token.toLowerCase()))errors.push(`SQL 2.7 sin garantía: ${token}`);}
for(const forbidden of ["insert into financial_app.","update financial_app.","delete from financial_app."]){if(sql.includes(forbidden))errors.push(`La lectura 2.7 contiene escritura prohibida: ${forbidden}`);}
const origin=read(required[1]);
for(const token of ["split","manual","rule","source","resolveClassificationOrigin"]){if(!origin.includes(token))errors.push(`Procedencia incompleta: ${token}`);}
const client=read(required[4]);
for(const token of ["Previsualizar regla","Crear regla","previewedId","suggestionRulePayload"]){if(!client.includes(token))errors.push(`UI 2.7 sin guardarraíl: ${token}`);}
const layout=read("app/layout.tsx");if(!layout.includes("./explicabilidad/explainability.css"))errors.push("CSS de explicabilidad no cargado");
const sidebar=read("components/app-sidebar.tsx");if(!sidebar.includes('["Explicabilidad", "/explicabilidad"]'))errors.push("Explicabilidad no está en navegación");
const vercel=read("vercel.json");if(!vercel.includes('"develop/v2.7.0-explainability-rebuild": false'))errors.push("Vercel no está bloqueado para la rama 2.7 reconstruida");
const ci=read(".github/workflows/ci.yml");for(const token of ["audit:v270","test:explainability"]){if(!ci.includes(token))errors.push(`CI no ejecuta ${token}`);}
if(errors.length){console.error("Financial App 2.7 audit FAILED");errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
console.log("Financial App 2.7 audit OK · explicabilidad solo lectura, preview obligatorio y protección de regresiones");
