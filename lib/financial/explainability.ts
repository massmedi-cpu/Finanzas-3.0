import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import type { ClassificationOrigin } from "@/lib/financial/classification-origin";

export type ExplainabilitySample={sourceId:string;date:string|null;amount:number};
export type ExplainabilitySuggestion={
  id:string;merchant:string;direction:"income"|"expense";targetCategory:string;targetSubcategory:string|null;
  matched:number;dominantMatches:number;confidence:number;samples:ExplainabilitySample[];
};
export type ExplainabilityPrecedence={key:ClassificationOrigin;label:string;detail:string;priority:number};
export type ExplainabilityOverview={
  version:string;
  provenance:{total:number;source:number;rule:number;manual:number;split:number};
  precedence:ExplainabilityPrecedence[];
  suggestions:ExplainabilitySuggestion[];
  guardrails:{readOnly:boolean;sourceUntouched:boolean;previewRequired:boolean;minSamples:number;minDominance:number;manualOverridesExcluded:boolean;splitsExcluded:boolean;existingRuleApplicationsExcluded:boolean};
};

type JsonRecord=Record<string,unknown>;
const record=(value:unknown):JsonRecord=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as JsonRecord:{};
const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const text=(value:unknown,fallback="")=>typeof value==="string"?value:fallback;

export function normalizeExplainabilityOverview(value:unknown):ExplainabilityOverview{
  const raw=record(value);const provenance=record(raw.provenance);const guardrails=record(raw.guardrails);
  return {
    version:text(raw.version,APP_VERSION),
    provenance:{total:n(provenance.total),source:n(provenance.source),rule:n(provenance.rule),manual:n(provenance.manual),split:n(provenance.split)},
    precedence:Array.isArray(raw.precedence)?raw.precedence.map(item=>{const p=record(item);const key=text(p.key,"source") as ClassificationOrigin;return{key,label:text(p.label,key),detail:text(p.detail),priority:n(p.priority)};}):[],
    suggestions:Array.isArray(raw.suggestions)?raw.suggestions.map(item=>{const s=record(item);return{
      id:text(s.id),merchant:text(s.merchant,"Movimiento recurrente"),direction:s.direction==="income"?"income":"expense",
      targetCategory:text(s.targetCategory,"Sin categoría"),targetSubcategory:typeof s.targetSubcategory==="string"&&s.targetSubcategory.trim()?s.targetSubcategory:null,
      matched:n(s.matched),dominantMatches:n(s.dominantMatches),confidence:n(s.confidence),
      samples:Array.isArray(s.samples)?s.samples.map(sample=>{const x=record(sample);return{sourceId:text(x.sourceId),date:typeof x.date==="string"?x.date:null,amount:n(x.amount)};}):[],
    };}):[],
    guardrails:{
      readOnly:guardrails.readOnly!==false,sourceUntouched:guardrails.sourceUntouched!==false,previewRequired:guardrails.previewRequired!==false,
      minSamples:n(guardrails.minSamples)||3,minDominance:n(guardrails.minDominance)||0.8,manualOverridesExcluded:guardrails.manualOverridesExcluded!==false,
      splitsExcluded:guardrails.splitsExcluded!==false,existingRuleApplicationsExcluded:guardrails.existingRuleApplicationsExcluded!==false,
    },
  };
}

export async function getExplainabilityOverview(limit=20):Promise<ExplainabilityOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_explainability_overview",{p_limit:Math.max(1,Math.min(limit,50))});
  if(error||!data)throw new Error(error?.message||"explainability_unavailable");
  return normalizeExplainabilityOverview(data);
}

export function suggestionRulePayload(suggestion:ExplainabilitySuggestion){
  return {
    name:`Clasificar ${suggestion.merchant}`.slice(0,120),priority:100,active:true,
    match_counterparty:suggestion.merchant,counterparty_operator:"equals",match_concept:null,concept_operator:"contains",
    match_type:null,match_category:null,match_account_id:null,amount_min:null,amount_max:null,direction:suggestion.direction,
    set_category:suggestion.targetCategory,set_subcategory:suggestion.targetSubcategory,add_tags:[],set_recurring:null,stop_processing:true,
  };
}
