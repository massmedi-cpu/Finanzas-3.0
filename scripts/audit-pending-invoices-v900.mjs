import fs from "node:fs";

const read=file=>fs.readFileSync(file,"utf8");
const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message)};

const sql=read("database/FINANCIAL_APP_9.0.0_PENDING_INVOICE_COMMITMENTS.sql");
const calendar=read("lib/financial/forecast-calendar.ts");
const liquidity=read("lib/financial/forecast-liquidity.ts");
const dashboard=read("components/forecast-liquidity-dashboard.tsx");
const page=read("app/prevision/page.tsx");
const scenario=read("database/FINANCIAL_APP_8.0.0_SCENARIO_LAB.sql");

for(const token of [
  "forecast_calendar_document_commitments_core",
  "forecast_calendar_visible_core(p_start,p_months)",
  "d.document_type='invoice'",
  "d.ocr_status='complete'",
  "d.document_date between current_date-45 and current_date+30",
  "document_match_candidates_rows_core(f.document_id,1)",
  "forecast_event_overrides",
  "'pendingInvoiceCommitments',true",
  "'pendingInvoiceLookbackDays',45",
  "'pendingInvoiceFallbackDays',7",
  "'pendingInvoiceRequiresNoMovementCandidate',true",
  "'pendingInvoiceDeduplicatesCanonicalForecast',true",
  "'pendingInvoiceDismissible',true",
  "'sourceDataReadOnly',true",
  "forecast_calendar_document_commitments_core(v_start,v_months)"
])must(sql.includes(token),`Contrato 9.0 incompleto: ${token}`);

must(!/create\s+table/i.test(sql),"9.0 no debe crear persistencia paralela para facturas pendientes");
must(!/\b(insert\s+into|update|delete\s+from)\s+financial_app\.(documents|transactions)\b/i.test(sql),"9.0 no puede mutar documentos o movimientos de origen");
must(/revoke all on function public\.financial_app_forecast_calendar\(date,integer\) from public,anon/i.test(sql),"El calendario público debe seguir bloqueando anon");
must(/grant execute on function public\.financial_app_forecast_calendar\(date,integer\) to authenticated,service_role/i.test(sql),"Falta grant autenticado del calendario 9.0");
must(/create or replace function public\.financial_app_forecast_calendar[\s\S]+?security invoker/i.test(sql),"El wrapper público del calendario debe seguir siendo SECURITY INVOKER");
must(sql.includes("not exists(\n        select 1\n        from jsonb_array_elements(coalesce(v_base->'events','[]'::jsonb))"),"La evidencia documental debe deduplicar contra el calendario canónico");
must(scenario.includes("forecast_liquidity_core(v_start,v_days)"),"8.0 debe seguir heredando 9.0 exclusivamente a través del core de liquidez");

for(const token of ["ForecastCalendarSource=\"automatic\"|\"manual\"|\"document\"","pendingInvoiceCommitments","pendingInvoiceDeduplicatesCanonicalForecast"])
  must(calendar.includes(token),`Tipado de calendario 9.0 incompleto: ${token}`);
for(const token of ["source:\"automatic\"|\"manual\"|\"document\"","pendingInvoiceCommitments"])
  must(liquidity.includes(token),`Tipado de liquidez 9.0 incompleto: ${token}`);
must(dashboard.includes('return"Factura pendiente"'),"Liquidez debe identificar visualmente las facturas pendientes");
must(dashboard.includes("nunca crean por sí solas una asociación bancaria"),"La UI debe explicar el límite de seguridad documental");
must(page.includes("facturas recientes todavía sin cargo bancario"),"Previsión debe explicar la nueva fuente documental");

if(failures.length){console.error("Financial App 9.0.0 pending invoice audit FAILED");for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log("Financial App 9.0.0 pending invoice audit OK · facturas recientes enriquecen el forecast canónico sin autoenlace, persistencia paralela ni doble conteo");
