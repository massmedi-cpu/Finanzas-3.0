import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiJson,apiUnauthorized } from "@/lib/api/response";
import { processDocumentStorageCleanup } from "@/lib/document/storage-cleanup";

export const dynamic="force-dynamic";

export async function POST(){
  const supabase=await getAuthorizedClient();
  if(!supabase)return apiUnauthorized();
  const result=await processDocumentStorageCleanup(supabase,25);
  return apiJson({ok:true,...result});
}
