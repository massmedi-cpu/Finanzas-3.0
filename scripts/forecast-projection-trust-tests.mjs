import fs from 'node:fs';

const sql = fs.readFileSync('database/v9.0.0-forecast-projection-trust.sql', 'utf8');

function requireMatch(pattern, message) {
  if (!pattern.test(sql)) throw new Error(message);
}

requireMatch(/create or replace function financial_app\.forecast_match_is_trustworthy\(p_event jsonb\)/i,
  'Missing isolated forecast match trust boundary');
requireMatch(/identityRank[\s\S]{0,220}::integer\s*<=\s*1/i,
  'Automatic received state must require exact/contained identity');
requireMatch(/\{actual\}'\s*,\s*'null'::jsonb[\s\S]{0,180}\{match\}'\s*,\s*'null'::jsonb/i,
  'Weak matches must clear actual evidence and match metadata');
requireMatch(/from jsonb_array_elements\(v_events\) e\(item\)/i,
  'Projection aggregates must read the filtered trusted event set');
requireMatch(/'projectionMonths'\s*,\s*v_projection_months/i,
  'Recomputed projection must replace the inherited projection payload');
requireMatch(/jsonb_array_elements\(coalesce\(v_payload->'actualMonths'/i,
  'Projection must preserve actual cash-flow months');
requireMatch(/'receivedRequiresStrongIdentity'\s*,\s*true/i,
  'Rules must expose strict received identity matching');
requireMatch(/'projectionRecomputedAfterPrecision'\s*,\s*true/i,
  'Rules must expose projection/event consistency');
requireMatch(/grant execute on function financial_app\.forecast_match_is_trustworthy\(jsonb\) to authenticated, service_role/i,
  'SECURITY INVOKER chain needs authenticated helper execution');

const transferIndex = sql.indexOf("when descriptor ~ '(transfer|bizum|entre mis cuentas|movimientos internos)' then false");
const yearlyIndex = sql.indexOf("when frequency = 'yearly'");
if (transferIndex < 0 || yearlyIndex < 0 || transferIndex > yearlyIndex) {
  throw new Error('Transfer/Bizum exclusion must take precedence over yearly obligation inference');
}

if (/security\s+definer/i.test(sql)) {
  throw new Error('This trust layer must remain SECURITY INVOKER');
}

console.log('Forecast projection trust contract OK');