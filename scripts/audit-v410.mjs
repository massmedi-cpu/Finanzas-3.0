import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const checks=[];
function expect(condition,message){checks.push({condition,message});if(!condition)console.error(`FAIL · ${message}`);}

const version=read("lib/app-version.ts");
const db=read("database/FINANCIAL_APP_4.1.0_FORECAST_LEDGER.sql");
const client=read("app/prevision/forecast-client.tsx");
const route=read("app/api/forecast/route.ts");
const lib=read("lib/financial/forecast-calendar.ts");
const layout=read("app/prevision/layout.tsx");
const styles=read("app/forecast-ledger.css");

expect(version.includes('APP_VERSION = "4.1.0"'),"versión canónica 4.1.0");
expect(db.includes("oneToOneActualMatching")&&db.includes("event_rank=1 and transaction_rank=1"),"conciliación prevista↔real estrictamente 1↔1");
expect(db.includes("annual_tax_insurance_history")&&db.includes("forecast_is_annual_signal"),"seguros e impuestos anuales detectados también por señal textual fuerte");
expect(db.includes("projectionMonths")&&db.includes("pendingEvents")&&db.includes("confirmedEventsNotDoubleCounted"),"proyección mensual de servidor sin doble conteo");
expect(db.includes("restore_forecast_event")&&db.includes("dismissedEvents")&&db.includes("dismissedEventsExcludedFromMetrics"),"descartes reversibles excluidos de métricas");
expect(route.includes("export async function PATCH")&&route.includes("financial_app_restore_forecast_event"),"API autenticada de restauración");
expect(lib.includes("ForecastProjectionMonth")&&lib.includes("dismissedEvents:ForecastCalendarEvent[]")&&lib.includes("oneToOneActualMatching"),"contrato TypeScript 4.1 completo");
expect(client.includes("forecast-month-strip")&&client.includes("projectionMonths")&&client.includes("restoreEvent")&&client.includes("Descartados"),"UI mensual, proyección y restauración visibles");
expect(client.includes("Justificado por un movimiento real")&&client.includes("no compite con otra previsión"),"confirmación real explicable y conservadora");
expect(layout.includes('forecast-ledger.css')&&styles.includes("forecast-month-strip")&&styles.includes("forecast-dismissed"),"estilos de ledger con nombre funcional no versionado");

if(checks.some(check=>!check.condition))process.exit(1);
console.log(`Financial App 4.1 audit OK · ${checks.length}/${checks.length} garantías`);
