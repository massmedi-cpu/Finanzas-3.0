import { createClient } from "@/lib/supabase/server";

export type ReconciliationSummary={total:number;reconciled:number;pending:number;notReconciled:number;notApplicable:number};
export type ReconciliationPair={id:string;a:string;b:string;amount:number;dateA:string;dateB:string;accountA:string;accountB:string;identifierA:string;identifierB:string;method:string;confidence:number;reason:string|null;createdAt:string};
export type ReconciliationGroup={identifier:string;account:string;subcategory:string;status:"pending"|"not_reconciled";count:number;firstDate:string;lastDate:string;grossAmount:number};
export type ReconciliationOverview={version:string;summary:ReconciliationSummary;pairs:ReconciliationPair[];unresolvedGroups:ReconciliationGroup[];methods:{method:string;count:number}[]};
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
export async function getReconciliationOverview():Promise<ReconciliationOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_reconciliation_overview");
  if(error||!data)throw new Error(error?.message||"reconciliation_unavailable");
  const r=data as any;
  return {
    version:String(r.version||"1.0.0-rc.1"),
    summary:{total:n(r.summary?.total),reconciled:n(r.summary?.reconciled),pending:n(r.summary?.pending),notReconciled:n(r.summary?.notReconciled),notApplicable:n(r.summary?.notApplicable)},
    pairs:Array.isArray(r.pairs)?r.pairs.map((x:any)=>({...x,amount:n(x.amount),confidence:n(x.confidence)})):[],
    unresolvedGroups:Array.isArray(r.unresolvedGroups)?r.unresolvedGroups.map((x:any)=>({...x,count:n(x.count),grossAmount:n(x.grossAmount)})):[],
    methods:Array.isArray(r.methods)?r.methods.map((x:any)=>({method:String(x.method),count:n(x.count)})):[],
  };
}
