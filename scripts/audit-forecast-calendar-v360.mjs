import fs from "node:fs";

const read=path=>fs.readFileSync(path,"utf8");
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};
const appVersion=read("lib/app-version.ts");
const page=read("app/prevision/page.tsx");
const client=read("app/prevision/forecast-client.tsx");
const layout=read("app/prevision/layout.tsx");
const css=read("app/forecast.css");
const api=read("app/api/forecast/route.ts");
const lib=read("lib/financial/forecast-calendar.ts");
const migration=read("database/FINANCIAL_APP_3.6.0_FORECAST_CALENDAR.sql");

must(appVersion.includes('APP_VERSION = "3.6.0"'),"La versión visible debe ser 3.6.0");
must(page.includes("getForecastCalendar(12)")&&page.includes("Calendario de próximos movimientos"),"Previsión debe cargar el calendario anual");
must(!page.includes("ScenarioSimulator")&&!fs.existsSync("app/prevision/scenario-simulator.tsx"),"El simulador retirado no debe seguir en runtime");
must(!fs.existsSync("app/api/forecast/scenario/route.ts")&&!fs.existsSync("app/forecast-scenario.css")&&!layout.includes("forecast-scenario.css"),"No debe quedar código muerto del simulador");
for(const token of ["forecast-calendar-grid","AGENDA DEL MES","Confirmado por un movimiento real","Pasados sin confirmar","Añadir movimiento esperado","Fecha estimada","value=\"yearly\""])
  must(client.includes(token),`Falta contrato de calendario: ${token}`);
must(api.includes("financial_app_forecast_calendar")&&api.includes("p_months"),"El API debe leer el calendario canónico");
must(lib.includes("ForecastCalendarActual")&&lib.includes("actualMovementConfirms")&&lib.includes("annualInsuranceAndTaxPatterns"),"El tipado debe separar estimación y movimiento real");
for(const token of ["financial_app_forecast_calendar","previous_year_seasonal","annualInsuranceAndTaxPatterns","actualMovementConfirms","interval_months=12","'received'"])
  must(migration.includes(token),`Motor de calendario incompleto: ${token}`);
must(migration.includes("revoke all on function financial_app.forecast_calendar_core(date,integer) from public,anon")&&migration.includes("grant execute on function public.financial_app_forecast_calendar(date,integer) to authenticated,service_role"),"El RPC debe mantener autorización explícita");
must(css.includes(".forecast-calendar-grid{")&&css.includes(".forecast-agenda-item{")&&css.includes("@media(max-width:680px)"),"El calendario debe tener layouts de escritorio y móvil");

if(failures.length){console.error("Forecast calendar 3.6 audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log("Forecast calendar 3.6 audit OK · calendario mensual, anuales, confirmación bancaria y limpieza del simulador protegidos");
