import { createClient } from "@/lib/supabase/server";

export type ArchiveMovementRef = { sourceId:string; date:string|null; amount:number|null; concept:string|null; counterparty:string|null; score?:number };
export type ArchiveDocument = {
  id:string; fileName:string; mimeType:string|null; storagePath:string|null; fileSize:number|null; contentHash:string|null;
  documentType:string; documentDate:string|null; amount:number|null; merchant:string|null; ocrStatus:string; hasOcrText:boolean;
  hasReconstruction:boolean; notes:string|null; archivedAt:string|null; createdAt:string; updatedAt:string;
  links:ArchiveMovementRef[]; suggestions:ArchiveMovementRef[];
};
export type ArchiveOverview = {
  ok?:true; version:string; bucket:string; private:boolean; maxFileSize:number; allowedMimeTypes:string[];
  total:number; processed:number; linked:number; documents:ArchiveDocument[];
};
export type ArchiveDetail = ArchiveDocument & {
  ocrText:string|null; ocrData:Record<string,unknown>|null; digitalReconstruction:Record<string,unknown>|null;
  history:Array<{action:string;before:unknown;after:unknown;changedBy:string|null;changedAt:string}>;
};

export async function getArchiveOverview(search:string|null=null):Promise<ArchiveOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search,p_limit:100,p_offset:0,p_include_archived:true});
  if(error||!data) throw new Error(error?.message||"archive_unavailable");
  return data as ArchiveOverview;
}
