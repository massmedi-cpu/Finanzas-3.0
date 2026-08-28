import fs from "node:fs";

const migration=fs.readFileSync("database/FINANCIAL_APP_6.4.8_FORECAST_PRECISION.sql","utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

for(const token of [
  "create or replace function financial_app.forecast_calendar_visible_core",
  "from historic prior",
  "prior.key_norm=h.key_norm",
  "extract(year from prior.d)<>extract(year from h.d)",
  "(seguros|seguro)",
  "domiciliacion impuesto",
  "genericTaxNeedsRepeatedIdentity",
  "financial_app.forecast_calendar_core(p_start,p_months)",
  "forecast_event_overrides",
  "oneToOneActualMatching",
  "serverSideMonthlyProjection"
]) must(migration.includes(token),`Precisión de Previsión 6.4.8 incompleta: ${token}`);

must(!migration.includes("create table"),"6.4.8 no debe crear almacenamiento paralelo de previsiones");
must(!migration.includes("drop function financial_app.forecast_calendar_core"),"6.4.8 no debe sustituir el motor canónico base");
must(!migration.includes("update financial_app.transactions"),"6.4.8 no puede modificar movimientos bancarios");
must(!migration.includes("delete from financial_app.transactions"),"6.4.8 no puede borrar movimientos bancarios");

function keepAnnualCandidate({category="",subcategory="",title="",years=1}){
  const categoryText=`${category} ${subcategory}`.toLowerCase();
  const titleText=title.toLowerCase();
  const insurance=/(seguros|seguro)/.test(categoryText);
  const explicit=/(seguro|línea directa|linea directa|domiciliacion impuesto|domiciliación impuesto|impuesto|irpf|\bibi\b|\bivtm\b|tributo|tasa municipal)/.test(titleText);
  return insurance||explicit||years>=2;
}

must(keepAnnualCandidate({category:"Impuestos y tasas",subcategory:"Impuesto / tasa",title:"COMPRA BIZUM AYUNTAMIENTO DE SEVILLA 2025-10-31 PEDIDO 00001 7671638",years:1})===false,"Un Bizum fiscal genérico observado una sola vez no debe proyectarse anualmente");
must(keepAnnualCandidate({category:"Impuestos y tasas",subcategory:"Impuesto / tasa municipal",title:"AYTO DE SEVILLA",years:4})===true,"Una tasa municipal repetida en varios años debe conservarse");
must(keepAnnualCandidate({category:"Seguros",subcategory:"Seguro pendiente de asignar",title:"Línea Directa",years:1})===true,"Un seguro explícito debe seguir proyectándose desde la primera evidencia");
must(keepAnnualCandidate({category:"Impuestos y tasas",subcategory:"Impuesto / tasa",title:"DOMICILIACION IMPUESTO: 2.025 I.R.P.F.-",years:1})===true,"IRPF explícito debe seguir proyectándose aunque cambie el texto anual");

if(failures.length){console.error("Financial App 6.4.8 forecast precision audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 6.4.8 forecast precision audit OK · tasas genéricas requieren repetición sin perder seguros ni impuestos explícitos");
