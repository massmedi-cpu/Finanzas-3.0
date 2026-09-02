import fs from 'node:fs';

const migration=fs.readFileSync('database/v9.0.0-forecast-automatic-precision.sql','utf8');

function expect(value,message){if(!value){console.error(`FAIL: ${message}`);process.exitCode=1}else console.log(`OK: ${message}`)}

expect(migration.includes('forecast_auto_event_is_reliable'),'shared automatic reliability boundary exists');
expect(migration.includes("source <> 'automatic' then true"),'manual and document events bypass automatic filtering');
expect(migration.includes("frequency = 'yearly'"),'yearly events receive a dedicated strict policy');
expect(migration.includes('annualRequiresTaxOrInsurance'),'annual tax/insurance requirement is exposed in forecast rules');
expect(migration.includes('(nomina|salario|sueldo|pension)'),'positive automatic income requires salary/pension evidence');
expect(migration.includes('(transfer|bizum|entre mis cuentas|movimientos internos)'),'transfer and Bizum predictions are rejected');
expect(migration.includes('suscrip'),'subscriptions remain eligible recurring obligations');
expect(migration.includes('vivienda'),'housing obligations remain eligible');
expect(migration.includes('telecom'),'telecom obligations remain eligible');
expect(migration.includes('forecast_calendar_document_commitments_core'),'precision filter wraps the canonical document-aware forecast');
expect(migration.includes("'events', v_events"),'filtered events replace the canonical event array');
expect(migration.includes("'counts', v_counts"),'counts are recomputed after filtering');
expect(migration.includes('forecast_calendar_precision_core(p_start,p_months)'),'public forecast RPC routes through precision core');
expect(migration.includes('revoke all on function public.financial_app_forecast_calendar(date,integer) from public, anon'),'public/anon execution remains blocked');

// Production regressions this policy is designed to eliminate.
const weakExamples=['SEPE / INEM','SumUp *Avila bar','Manuel A N','LEFTIES','ESTANCO','FARMACIA CLAUDIA TEJADA R'];
for(const label of weakExamples)expect(!migration.includes(`allow:${label}`),`${label} is not hard-coded as an allowed recurrence`);

if(process.exitCode)process.exit(process.exitCode);
console.log('Forecast automatic precision contract OK');
