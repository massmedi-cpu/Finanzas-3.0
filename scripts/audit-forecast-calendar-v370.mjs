import fs from "node:fs";
import path from "node:path";

const read=p=>fs.readFileSync(p,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};
const appVersion=read("lib/app-version.ts");
const globals=read("app/globals.css");
const navigation=read("components/app-navigation.tsx");
const client=read("app/prevision/forecast-client.tsx");
const css=read("app/forecast.css");
const api=read("app/api/forecast/route.ts");
const lib=read("lib/financial/forecast-calendar.ts");
const migration=read("database/FINANCIAL_APP_3.7.0_FORECAST_DISMISSALS.sql");

must(appVersion.includes('APP_VERSION = "3.7.0"'),"La versión visible debe ser 3.7.0");
for(const token of ["--accent:#0b4f8a","--accent-soft:#e7f1fb","--focus:#0b4f8a","--accent:#4c9bff","--focus:#4c9bff"])
  must(globals.includes(token),`Falta identidad azul canónica: ${token}`);
for(const legacy of ["#6f4e37","#d2a174","#8d6441","#ede2d7","#34281f"])
  must(!globals.toLowerCase().includes(legacy),`globals.css conserva marrón retirado: ${legacy}`);
must(navigation.includes('["Previsión","/prevision"]'),"Previsión debe existir en navegación");
const primaryBlock=navigation.split("const secondary")[0];
const secondaryBlock=navigation.split("const secondary")[1]?.split("const mobilePrimary")[0]||"";
const mobileBlock=navigation.split("const mobilePrimary")[1]?.split("function matches")[0]||"";
must(primaryBlock.includes('["Previsión","/prevision"]'),"Previsión debe ser destino primario en escritorio");
must(!secondaryBlock.includes('["Previsión","/prevision"]'),"Previsión no debe seguir duplicada en el menú secundario");
must(mobileBlock.includes('["Previsión","/prevision"]'),"Previsión debe ser destino principal en móvil");
for(const token of ["forecast-cashflow-summary","Cash Flow estimado","Ingresos estimados","Gastos estimados","effectiveAmount(event)","forecast-delete-button","removeEvent(event)","Ya no cuenta en los cálculos del mes"])
  must(client.includes(token),`Previsión 3.7 ha perdido contrato: ${token}`);
must(client.includes('event.status==="received"&&event.actual?event.actual.amount:event.estimatedAmount'),"Los confirmados deben usar importe real y los demás estimado");
must(api.includes("financial_app_dismiss_forecast_event")&&api.includes("eventId")&&api.includes("p_estimated_date"),"DELETE de Previsión debe descartar una ocurrencia persistente");
must(lib.includes("dismissibleOccurrences")&&lib.includes("dismissedEventsExcludedFromMetrics"),"El contrato tipado debe declarar descarte y exclusión de métricas");
for(const token of ["forecast_event_overrides","dismiss_forecast_event","financial_app_dismiss_forecast_event","dismissibleOccurrences","dismissedEventsExcludedFromMetrics","o.event_id=x.item->>'id'"])
  must(migration.includes(token),`Migración 3.7 incompleta: ${token}`);
must(migration.includes("revoke all on table financial_app.forecast_event_overrides from public,anon,authenticated")&&migration.includes("grant execute on function public.financial_app_dismiss_forecast_event"),"La persistencia de descartes debe mantener frontera de autorización");
must(css.includes(".forecast-cashflow-summary{")&&css.includes(".forecast-delete-button{"),"Faltan estilos del resumen o del botón Eliminar");

const roots=["app","components"];
const banned=["#6f4e37","#d2a174","#8d6441","#ede2d7","#34281f"];
for(const root of roots){
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(css|tsx|ts)$/.test(entry.name)){const text=read(full).toLowerCase();for(const color of banned)if(text.includes(color))failures.push(`${full}: conserva color marrón retirado ${color}`);}}};
  walk(root);
}

if(failures.length){console.error("Forecast and blue identity 3.7 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log("Forecast and blue identity 3.7 audit OK · azul canónico, Previsión primaria, descartes persistentes y cash flow mensual protegidos");
