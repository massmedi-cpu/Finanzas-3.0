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

async function archiveOverview(search:string|null,includeArchived:boolean,limit=200,offset=0):Promise<ArchiveOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search,p_limit:limit,p_offset:offset,p_include_archived:includeArchived});
  if(error||!data)throw new Error(error?.message||"archive_unavailable");
  const overview=data as ArchiveOverview;
  return {...overview,hasMore:overview.documents.length>=limit};
}

export async function getArchiveOverview(search:string|null=null):Promise<ArchiveOverview>{
  return archiveOverview(search,false);
}

export async function getArchiveAllOverview(search:string|null=null):Promise<ArchiveOverview>{
  return archiveOverview(search,true);
}

export async function getArchivedDocuments(search:string|null=null):Promise<ArchiveOverview>{
  const all=await archiveOverview(search,true);
  const active=await archiveOverview(search,false);
  const archived=all.documents.filter(document=>Boolean(document.archivedAt));
  return {...all,total:Math.max(0,all.total-active.total),processed:archived.filter(document=>["complete","manual","not_required"].includes(document.ocrStatus)).length,linked:archived.filter(document=>document.links.length>0).length,hasMore:false,documents:archived};
}

export async function getArchiveReviewQueue():Promise<ArchiveReviewQueue>{
  const overview=await archiveOverview(null,false,200,0);
  const documents=overview.documents
    .filter(document=>!document.archivedAt&&document.links.length===0&&document.suggestions.length>0)
    .sort((a,b)=>{
      const scoreA=Math.max(...a.suggestions.map(item=>Number(item.score||0)),0);
      const scoreB=Math.max(...b.suggestions.map(item=>Number(item.score||0)),0);
      return scoreB-scoreA||String(b.documentDate||b.createdAt).localeCompare(String(a.documentDate||a.createdAt));
    });
  return {version:overview.version,total:documents.length,documents};
}
