import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api/response";
import { processDriveDocumentHydration } from "@/lib/document/drive-content-hydration";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

export async function POST(){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();

  const{data:sessionData,error:sessionError}=await supabase.auth.getSession();
  const accessToken=sessionData.session?.access_token;
  if(sessionError||!accessToken)return apiError("session_unavailable",401);

  try{
    const upstream=await fetch(`${SUPABASE_URL}/functions/v1/financial-app-sync`,{
      method:"POST",
      headers:{apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${accessToken}`,"content-type":"application/json"},
      body:JSON.stringify({action:"sync"}),
      cache:"no-store",
    });
    const raw=await upstream.text();let payload:Record<string,unknown>|null=null;
    try{payload=raw?JSON.parse(raw):null}catch{payload=null}
    if(!upstream.ok||!payload||payload.ok===false){console.error("financial_app_api_failure",{context:"sync.upstream",status:upstream.status});return apiError("sync_failed",upstream.status>=500?502:Math.max(400,upstream.status));}

    let contentHydration:Record<string,unknown>;
    try{
      const result=await processDriveDocumentHydration(supabase,accessToken);
      contentHydration={...result,ok:true};
      if(result.completed>0||result.review>0||result.linked>0)payload.changed=true;
    }catch(failure){
      console.error("financial_app_drive_content_hydration_unavailable",{type:failure instanceof Error?failure.name:"unknown_failure"});
      contentHydration={ok:false,error:"drive_content_hydration_unavailable"};
    }
    const documents=payload.documents&&typeof payload.documents==="object"&&!Array.isArray(payload.documents)?payload.documents as Record<string,unknown>:{};
    payload.documents={...documents,contentHydration};
    return apiJson(payload,upstream.status);
  }catch{
    console.error("financial_app_api_failure",{context:"sync.fetch",publicCode:"sync_unavailable"});
    return apiError("sync_unavailable",502);
  }
}
