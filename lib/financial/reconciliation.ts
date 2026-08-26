import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asArray, asBoolean, asNumber, asRecord, asString, nullableString } from "@/lib/validation/json";

export type ReconciliationSummary={total:number;reconciled:number;pending:number;notReconciled:number;notApplicable:number};
export type ReconciliationPair={id:string;a:string;b:string;amount:number;dateA:string;dateB:string;accountA:string;accountB:string;identifierA:string;identifierB:string;method:string;confidence:number;reason:string|null;createdAt:string};
export type ReconciliationGroup={identifier:string;account:string;subcategory:string;status:"pending"|"not_reconciled";count:number;firstDate:string;lastDate:string;grossAmount:number};
export type ReconciliationOverview={version:string;summary:ReconciliationSummary;pairs:ReconciliationPair[];unresolvedGroups:ReconciliationGroup[];methods:{method:string;count:number}[]};

export type ReconciliationCandidate={id:string;sourceId:string;date:string;amount:number;account:string;identifier:string;concept:string;updatedAt:string;dayDifference:number};
export type ReconciliationDecision={decision:string;reason:string|null;createdAt:string;decidedBy:string}|null;
export type ReconciliationCase={
  id:string;sourceId:string;date:string;amount:number;account:string;identifier:string;subcategory:string;concept:string;counterparty:string;
  status:"pending"|"not_reconciled";sourceStatus:string;override:boolean|null;internalTransfer:boolean;updatedAt:string;
  candidates:ReconciliationCandidate[];candidateCount:number;lastDecision:ReconciliationDecision;
};
export type ReconciliationQueue={ok:true;total:number;limit:number;offset:number;status:"pending"|"not_reconciled"|null;items:ReconciliationCase[]};

const pair=(value:unknown):ReconciliationPair=>{const x=asRecord(value);return{id:asString(x.id),a:asString(x.a),b:asString(x.b),amount:asNumber(x.amount),dateA:asString(x.dateA),dateB:asString(x.dateB),accountA:asString(x.accountA),accountB:asString(x.accountB),identifierA:asString(x.identifierA),identifierB:asString(x.identifierB),method:asString(x.method),confidence:asNumber(x.confidence),reason:nullableString(x.reason),createdAt:asString(x.createdAt)}};
const group=(value:unknown):ReconciliationGroup=>{const x=asRecord(value);return{identifier:asString(x.identifier),account:asString(x.account),subcategory:asString(x.subcategory),status:asString(x.status)==="not_reconciled"?"not_reconciled":"pending",count:asNumber(x.count),firstDate:asString(x.firstDate),lastDate:asString(x.lastDate),grossAmount:asNumber(x.grossAmount)}};
const candidate=(value:unknown):ReconciliationCandidate=>{const x=asRecord(value);return{id:asString(x.id),sourceId:asString(x.sourceId),date:asString(x.date),amount:asNumber(x.amount),account:asString(x.account),identifier:asString(x.identifier),concept:asString(x.concept),updatedAt:asString(x.updatedAt),dayDifference:asNumber(x.dayDifference)}};
const decision=(value:unknown):ReconciliationDecision=>{if(value==null)return null;const x=asRecord(value);return{decision:asString(x.decision),reason:nullableString(x.reason),createdAt:asString(x.createdAt),decidedBy:asString(x.decidedBy)}};
const queueCase=(value:unknown):ReconciliationCase=>{const x=asRecord(value);return{id:asString(x.id),sourceId:asString(x.sourceId),date:asString(x.date),amount:asNumber(x.amount),account:asString(x.account),identifier:asString(x.identifier),subcategory:asString(x.subcategory),concept:asString(x.concept),counterparty:asString(x.counterparty),status:asString(x.status)==="not_reconciled"?"not_reconciled":"pending",sourceStatus:asString(x.sourceStatus),override:x.override==null?null:asBoolean(x.override),internalTransfer:asBoolean(x.internalTransfer),updatedAt:asString(x.updatedAt),candidates:asArray(x.candidates).map(candidate),candidateCount:asNumber(x.candidateCount),lastDecision:decision(x.lastDecision)}};

export async function getReconciliationOverview():Promise<ReconciliationOverview>{const supabase=await createClient();const{data,error}=await supabase.rpc("financial_app_reconciliation_overview");if(error||!data)throw new Error(error?.message||"reconciliation_unavailable");const r=asRecord(data),summary=asRecord(r.summary);return{version:asString(r.version,APP_VERSION),summary:{total:asNumber(summary.total),reconciled:asNumber(summary.reconciled),pending:asNumber(summary.pending),notReconciled:asNumber(summary.notReconciled),notApplicable:asNumber(summary.notApplicable)},pairs:asArray(r.pairs).map(pair),unresolvedGroups:asArray(r.unresolvedGroups).map(group),methods:asArray(r.methods).map(value=>{const x=asRecord(value);return{method:asString(x.method),count:asNumber(x.count)}})}}

export async function getReconciliationQueue(status:"pending"|"not_reconciled"|null=null,limit=25,offset=0):Promise<ReconciliationQueue>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_reconciliation_queue",{p_status:status,p_limit:limit,p_offset:offset});
  if(error||!data)throw new Error(error?.message||"reconciliation_queue_unavailable");
  const r=asRecord(data);
  return{ok:true,total:asNumber(r.total),limit:asNumber(r.limit,limit),offset:asNumber(r.offset,offset),status:asString(r.status)==="pending"?"pending":asString(r.status)==="not_reconciled"?"not_reconciled":null,items:asArray(r.items).map(queueCase)};
}
