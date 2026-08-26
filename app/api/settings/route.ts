import { NextRequest } from "next/server";
import { APP_VERSION } from "@/lib/app-version";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";

export async function GET(){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const{data,error}=await supabase.rpc("financial_app_settings_overview");
  if(error||!data)return apiFailure("settings.overview",error,"settings_unavailable");
  return apiJson({ok:true,data:{...data,version:APP_VERSION}});
}

export async function PATCH(request:NextRequest){
  const supabase=await getAuthorizedClient();if(!supabase)return apiUnauthorized();
  const body=await request.json().catch(()=>null);const theme=String(body?.theme||"system");const timezone=String(body?.timezone||"Europe/Madrid");
  const{data,error}=await supabase.rpc("financial_app_settings_update",{p_theme:theme,p_timezone:timezone});
  if(error||!data)return apiFailure("settings.update",error,"settings_update_failed");
  return apiJson({ok:true,data:{...data,version:APP_VERSION}});
}
