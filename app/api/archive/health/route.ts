import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiFailure,apiJson,apiUnauthorized } from "@/lib/api/response";
import { processDocumentStorageCleanup } from "@/lib/document/storage-cleanup";

export const dynamic="force-dynamic";

export async function GET(){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  const maintenance=await processDocumentStorageCleanup(supabase,25);
  const {data,error}=await supabase.rpc("financial_app_document_lifecycle_health");
  if(error||!data)return apiFailure("archive.health",error,"archive_health_unavailable");
  return apiJson({ok:true,health:data,maintenance});
}
