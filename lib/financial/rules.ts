import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";

export type RuleTextOperator="contains"|"equals";
export type RuleDirection="any"|"income"|"expense";
export type RuleConditions={
  counterparty:string|null;counterpartyOperator:RuleTextOperator;concept:string|null;conceptOperator:RuleTextOperator;
  type:string|null;category:string|null;accountId:string|null;amountMin:number|null;amountMax:number|null;direction:RuleDirection;
};
export type RuleActions={category:string|null;subcategory:string|null;addTags:string[];recurring:boolean|null};
export type TransactionRule={
  id:string;name:string;active:boolean;priority:number;stopProcessing:boolean;conditions:RuleConditions;actions:RuleActions;
  applicationCount:number;activeApplicationCount:number;lastAppliedAt:string|null;createdAt:string;updatedAt:string;
};
export type RuleAccount={id:string;name:string;identifier:string};
export type RulesOverview={
  version:string;rules:TransactionRule[];accounts:RuleAccount[];
  summary:{totalRules:number;activeRules:number;totalApplications:number};
  guardrails:{sourceUntouched:boolean;manualOverridesProtected:boolean;duplicatesExcluded:boolean;sourceMissingExcluded:boolean};
};
export type RulePreviewSample={id:string;date:string|null;amount:number;counterparty:string|null;concept:string|null;category:string|null;subcategory:string|null;changes:Record<string,unknown>};
export type RulePreview={matched:number;changeable:number;samples:RulePreviewSample[];definition:Record<string,unknown>};

type JsonRecord=Record<string,unknown>;
const record=(value:unknown):JsonRecord=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as JsonRecord:{};
const textOrNull=(value:unknown)=>typeof value==="string"&&value.trim()?value:null;
const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const nullableNumber=(value:unknown)=>value==null||value===""?null:n(value);
const operator=(value:unknown):RuleTextOperator=>value==="equals"?"equals":"contains";
const direction=(value:unknown):RuleDirection=>value==="income"||value==="expense"?value:"any";

function normalizeRule(value:unknown):TransactionRule{
  const raw=record(value);const conditions=record(raw.conditions);const actions=record(raw.actions);
  return {
    id:String(raw.id||""),name:String(raw.name||"Regla"),active:Boolean(raw.active),priority:n(raw.priority)||100,stopProcessing:raw.stopProcessing!==false,
    conditions:{
      counterparty:textOrNull(conditions.counterparty),counterpartyOperator:operator(conditions.counterpartyOperator),concept:textOrNull(conditions.concept),conceptOperator:operator(conditions.conceptOperator),
      type:textOrNull(conditions.type),category:textOrNull(conditions.category),accountId:textOrNull(conditions.accountId),amountMin:nullableNumber(conditions.amountMin),amountMax:nullableNumber(conditions.amountMax),direction:direction(conditions.direction),
    },
    actions:{
      category:textOrNull(actions.category),subcategory:textOrNull(actions.subcategory),addTags:Array.isArray(actions.addTags)?actions.addTags.map(String):[],recurring:actions.recurring==null?null:Boolean(actions.recurring),
    },
    applicationCount:n(raw.applicationCount),activeApplicationCount:n(raw.activeApplicationCount),lastAppliedAt:textOrNull(raw.lastAppliedAt),createdAt:String(raw.createdAt||""),updatedAt:String(raw.updatedAt||""),
  };
}

export function normalizeRulesOverview(value:unknown):RulesOverview{
  const raw=record(value);const summary=record(raw.summary);const guardrails=record(raw.guardrails);
  return {
    version:String(raw.version||APP_VERSION),
    rules:Array.isArray(raw.rules)?raw.rules.map(normalizeRule):[],
    accounts:Array.isArray(raw.accounts)?raw.accounts.map(value=>{const account=record(value);return{id:String(account.id||""),name:String(account.name||"Cuenta"),identifier:String(account.identifier||"")};}):[],
    summary:{totalRules:n(summary.totalRules),activeRules:n(summary.activeRules),totalApplications:n(summary.totalApplications)},
    guardrails:{sourceUntouched:guardrails.sourceUntouched!==false,manualOverridesProtected:guardrails.manualOverridesProtected!==false,duplicatesExcluded:guardrails.duplicatesExcluded!==false,sourceMissingExcluded:guardrails.sourceMissingExcluded!==false},
  };
}

export async function getRulesOverview():Promise<RulesOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_rules_overview");
  if(error||!data)throw new Error(error?.message||"rules_unavailable");
  return normalizeRulesOverview(data);
}
