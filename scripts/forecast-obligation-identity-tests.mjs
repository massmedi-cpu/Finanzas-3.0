import fs from 'node:fs';

const coreSql = fs.readFileSync('database/v9.0.0-forecast-obligation-identity.sql','utf8');
const boundarySql = fs.readFileSync('database/v9.0.0-forecast-obligation-identity-security-boundary.sql','utf8');
const sql = `${coreSql}\n${boundarySql}`;

function requireMatch(pattern,message,text=sql){
  if(!pattern.test(text)) throw new Error(message);
}
function forbid(pattern,message,text=sql){
  if(pattern.test(text)) throw new Error(message);
}

requireMatch(/create or replace function financial_app\.forecast_obligation_fingerprint\(\s*p_original_concept text,\s*p_fallback text\s*\)/i,
  'Missing canonical obligation fingerprint helper');
if(!coreSql.includes("REF\\.?\\s+MANDATO\\s+([A-Z0-9]+)")) {
  throw new Error('Bank mandate parser is missing from the obligation fingerprint');
}
requireMatch(/bank_mandate:[\s\S]{0,120}md5\('financial-app-v900-obligation:'/i,
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

// The canonical precision core remains invoker. Only the two helpers that must read
// transaction evidence use a narrow owner boundary and verify the authorized identity.
forbid(/security\s+definer/i,
  'The canonical obligation/precision core must remain SECURITY INVOKER',coreSql);
requireMatch(/forecast_enrich_annual_obligation_evidence[\s\S]{0,220}security\s+definer/i,
  'Evidence helper must use the narrow read boundary',boundarySql);
requireMatch(/forecast_rematch_annual_obligation_event[\s\S]{0,220}security\s+definer/i,
  'Rematch helper must use the narrow read boundary',boundarySql);
const authGuards = boundarySql.match(/financial_app\.authorized_email\(\) is null/gi) ?? [];
if(authGuards.length < 2) throw new Error('Both SECURITY DEFINER helpers must verify the authorized user');
requireMatch(/revoke all on function financial_app\.forecast_enrich_annual_obligation_evidence\(jsonb\) from public, anon/i,
  'Public and anon must not execute the evidence boundary');
requireMatch(/revoke all on function financial_app\.forecast_rematch_annual_obligation_event\(jsonb\) from public, anon/i,
  'Public and anon must not execute the rematch boundary');
forbid(/grant\s+select\s+on\s+(table\s+)?financial_app\.(transactions|accounts)/i,
  'Obligation identity must never widen direct table read grants');

// The first migration creates the scalar helper before the boundary exists; the final
// migration state must revoke direct authenticated access to raw fingerprint construction.
const fpGrant = sql.lastIndexOf('grant execute on function financial_app.forecast_obligation_fingerprint(text,text) to authenticated, service_role');
const fpRevoke = sql.lastIndexOf('revoke execute on function financial_app.forecast_obligation_fingerprint(text,text) from authenticated');
if(fpGrant < 0 || fpRevoke <= fpGrant) throw new Error('Final state must keep fingerprint helper internal');
const memoryGrant = sql.lastIndexOf('grant execute on function financial_app.forecast_annual_memory_candidate(uuid,date,date) to authenticated, service_role');
const memoryRevoke = sql.lastIndexOf('revoke execute on function financial_app.forecast_annual_memory_candidate(uuid,date,date) from authenticated');
if(memoryGrant < 0 || memoryRevoke <= memoryGrant) throw new Error('Final state must keep annual-memory table reader internal');

forbid(/'mandateToken'|'rawMandate'|'mandateReference'/i,
  'Raw mandate fields must never be emitted into forecast JSON');

console.log('Forecast obligation identity contract OK');