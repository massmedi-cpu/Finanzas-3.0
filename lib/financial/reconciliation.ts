import { createClient } from "@/lib/supabase/server";

export type ReconciliationSummary={total:number;reconciled:number;pending:number;notReconciled:number;notApplicable:number};
export type ReconciliationPair={id:string;a:string;b:string;amount:number;dateA:string;dateB:string;accountA:string;accountB:string;identifierA:string;identifierB:string;method:string;confidence:number;reason:string|null;createdAt:string};
export type ReconciliationGroup={identifier:string;account:string;subcategory:string;status:"pending"|"not_reconciled";count:number;firstDate:string;lastDate:string;grossAmount:number};
export type ReconciliationMethod={method:string;count:number};
export type ReconciliationOverview={version:string;summary:ReconciliationSummary;pairs:ReconciliationPair[];unresolvedGroups:ReconciliationGroup[];methods:ReconciliationMethod[]};

export async function getReconciliationOverview():Promise<ReconciliationOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_reconciliation_overview");
  if(error||!data) throw new Error(error?.message||"reconciliation_unavailable");
  return data as ReconciliationOverview;
}
