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

export function suggestionRulePayload(suggestion:ExplainabilitySuggestion){
  return {
    name:`Clasificar ${suggestion.merchant}`.slice(0,120),priority:100,active:true,
    match_counterparty:suggestion.merchant,counterparty_operator:"equals",match_concept:null,concept_operator:"contains",
    match_type:null,match_category:null,match_account_id:null,amount_min:null,amount_max:null,direction:suggestion.direction,
    set_category:suggestion.targetCategory,set_subcategory:suggestion.targetSubcategory,add_tags:[],set_recurring:null,stop_processing:true,
  };
}
