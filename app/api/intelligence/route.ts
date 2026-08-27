import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { parseActionableIntelligence } from "@/lib/financial/actionable-intelligence";

export const dynamic="force-dynamic";

export async function GET(){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  const {data,error}=await supabase.rpc("financial_app_actionable_intelligence",{p_history_days:400});
  if(error||!data)return apiFailure("intelligence.read",error,"actionable_intelligence_unavailable");
  return apiJson(parseActionableIntelligence(data));
}
