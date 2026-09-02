import fs from 'node:fs';

const sql = fs.readFileSync('database/v9.0.0-forecast-obligation-identity.sql','utf8');

function requireMatch(pattern,message){
  if(!pattern.test(sql)) throw new Error(message);
}
function forbid(pattern,message){
  if(pattern.test(sql)) throw new Error(message);
}

requireMatch(/create or replace function financial_app\.forecast_obligation_fingerprint\(\s*p_original_concept text,\s*p_fallback text\s*\)/i,
  'Missing canonical obligation fingerprint helper');
requireMatch(/REF\\\.?\\s\+MANDATO[\\s\\S]{0,260}bank_mandate:[\\s\\S]{0,180}md5/i,
  'Bank mandate must be reduced to a non-raw internal fingerprint');
requireMatch(/forecast_obligation_fingerprint\([\s\S]{0,900}=v_obligation_fingerprint/i,
  'Annual memory must match the canonical obligation fingerprint');
requireMatch(/seasonal occurrence per year[\s\S]{0,520}extract\(doy[\s\S]{0,260}<=35/i,
  'Seasonal slots must remain separate for multi-occurrence obligations');
requireMatch(/identitySource[\s\S]{0,120}bank_mandate/i,
  'Evidence must expose only the identity source, not the raw mandate');
requireMatch(/observedOccurrencesPerYear/i,
  'Mandate-backed obligations must expose observed cadence evidence');
requireMatch(/rawMandateExposed[\s\S]{0,80}false/i,
  'Annual evidence must explicitly guarantee raw mandate non-exposure');
requireMatch(/automatic_obligation_identity/i,
  'Bank-mandate matching must have an explicit trusted method');
requireMatch(/v_fingerprint not like 'bank_mandate:%' then return p_event/i,
  'Fallback merchant identity must never upgrade an automatic received match');
requireMatch(/bankMandateObligationIdentity[\s\S]{0,80}true/i,
  'Forecast rules must advertise mandate-aware identity');
requireMatch(/rawBankMandateExposed[\s\S]{0,80}false/i,
  'Forecast rules must guarantee raw bank mandate non-exposure');
requireMatch(/seasonalSlotsPreserved[\s\S]{0,80}true/i,
  'Forecast rules must preserve semiannual/seasonal slots');
requireMatch(/projectionRecomputedAfterPrecision[\s\S]{0,120}bankMandateObligationIdentity/i,
  'Obligation identity must remain inside the projection-consistent precision core');
requireMatch(/grant execute on function financial_app\.forecast_obligation_fingerprint\(text,text\) to authenticated, service_role/i,
  'SECURITY INVOKER chain needs authenticated helper execution');
requireMatch(/revoke all on function financial_app\.forecast_obligation_fingerprint\(text,text\) from public, anon/i,
  'Public and anon must not execute the internal fingerprint helper');

forbid(/'mandateToken'|'rawMandate'|'mandateReference'/i,
  'Raw mandate fields must never be emitted into forecast JSON');
forbid(/security\s+definer/i,
  'New obligation identity layer must remain SECURITY INVOKER');

console.log('Forecast obligation identity contract OK');