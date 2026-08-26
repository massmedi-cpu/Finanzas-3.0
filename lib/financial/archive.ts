import { createClient } from "@/lib/supabase/server";

export type ArchiveMovementRef = { sourceId:string; date:string|null; amount:number|null; concept:string|null; counterparty:string|null; score?:number; associationOrigin?:string|null; confidence?:number|null };
export type ArchiveDocument = {
  id:string; fileName:string; mimeType:string|null; storageProvider?:string|null; storageUrl?:string|null; storagePath:string|null; fileSize:number|null; contentHash:string|null;
  documentType:string; documentDate:string|null; amount:number|null; merchant:string|null; ocrStatus:string; hasOcrText:boolean;
  hasReconstruction:boolean; notes:string|null; archivedAt:string|null; createdAt:string; updatedAt:string;
  links:ArchiveMovementRef[]; suggestions:ArchiveMovementRef[];
};
export type ArchiveOverview = {
  ok?:true; version:string; bucket:string; private:boolean; maxFileSize:number; allowedMimeTypes:string[];
  total:number; processed:number; linked:number; hasMore?:boolean; documents:ArchiveDocument[];
};
export type ArchiveDetail = ArchiveDocument & {
  ocrText:string|null; ocrData:Record<string,unknown>|null; digitalReconstruction:Record<string,unknown>|null;
  history:Array<{action:string;before:unknown;after:unknown;changedBy:string|null;changedAt:string}>;
};
export type ArchiveReviewQueue = { version:string; total:number; documents:ArchiveDocument[] };

export async function getArchiveOverview(search:string|null=null):Promise<ArchiveOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search,p_limit:200,p_offset:0,p_include_archived:true});
  if(error||!data) throw new Error(error?.message||"archive_unavailable");
  const overview=data as ArchiveOverview;
  return {...overview,hasMore:overview.documents.length>=200};
}

export async function getArchiveReviewQueue():Promise<ArchiveReviewQueue>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:null,p_limit:1000,p_offset:0,p_include_archived:false});
  if(error||!data) throw new Error(error?.message||"archive_review_unavailable");
  const overview=data as ArchiveOverview;
  const documents=overview.documents
    .filter(document=>!document.archivedAt&&document.links.length===0&&document.suggestions.length>0)
    .sort((a,b)=>{
      const scoreA=Math.max(...a.suggestions.map(item=>Number(item.score||0)),0);
      const scoreB=Math.max(...b.suggestions.map(item=>Number(item.score||0)),0);
      return scoreB-scoreA||String(b.documentDate||b.createdAt).localeCompare(String(a.documentDate||a.createdAt));
    });
  return {version:overview.version,total:documents.length,documents};
}
