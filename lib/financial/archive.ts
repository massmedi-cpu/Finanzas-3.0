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
export type ArchiveLifecycleState="new"|"pending"|"archived";
export type ArchiveLifecycleCounts={new:number;pending:number;archived:number};
export type ArchiveLifecycleOverview=ArchiveOverview&{state:ArchiveLifecycleState;counts:ArchiveLifecycleCounts};

async function archiveOverview(search:string|null,includeArchived:boolean,limit=200,offset=0):Promise<ArchiveOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search,p_limit:limit,p_offset:offset,p_include_archived:includeArchived});
  if(error||!data)throw new Error(error?.message||"archive_unavailable");
  const overview=data as ArchiveOverview;
  return {...overview,hasMore:offset+overview.documents.length<overview.total};
}

async function archiveOverviewAllPages(search:string|null,includeArchived:boolean,limit=200):Promise<ArchiveOverview>{
  const first=await archiveOverview(search,includeArchived,limit,0);
  if(first.documents.length>=first.total||first.documents.length<limit)return {...first,hasMore:false};

  const documents=[...first.documents];
  let offset=documents.length;
  while(offset<first.total){
    const page=await archiveOverview(search,includeArchived,limit,offset);
    if(page.documents.length===0)break;
    documents.push(...page.documents);
    offset+=page.documents.length;
    if(page.documents.length<limit)break;
  }
  return {...first,hasMore:documents.length<first.total,documents};
}

export async function getArchiveOverview(search:string|null=null,limit=200,offset=0):Promise<ArchiveOverview>{
  return archiveOverview(search,false,limit,offset);
}

export async function getArchiveAllOverview(search:string|null=null,limit=200,offset=0):Promise<ArchiveOverview>{
  return archiveOverview(search,true,limit,offset);
}

export async function getArchiveLifecycleOverview(
  state:ArchiveLifecycleState,
  search:string|null=null,
  limit=40,
  offset=0,
):Promise<ArchiveLifecycleOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_archive_lifecycle_overview",{
    p_state:state,
    p_search:search,
    p_limit:limit,
    p_offset:offset,
  });
  if(error||!data)throw new Error(error?.message||"archive_lifecycle_unavailable");
  const overview=data as ArchiveLifecycleOverview;
  return {...overview,hasMore:offset+overview.documents.length<overview.total};
}

export async function getArchivedDocuments(search:string|null=null):Promise<ArchiveOverview>{
  const first=await getArchiveLifecycleOverview("archived",search,100,0);
  if(!first.hasMore)return first;
  const documents=[...first.documents];
  let offset=documents.length;
  while(offset<first.total){
    const page=await getArchiveLifecycleOverview("archived",search,100,offset);
    if(page.documents.length===0)break;
    documents.push(...page.documents);
    offset+=page.documents.length;
    if(!page.hasMore)break;
  }
  return {...first,documents,hasMore:documents.length<first.total};
}

export async function getArchiveReviewQueue():Promise<ArchiveReviewQueue>{
  const overview=await archiveOverviewAllPages(null,false);
  const documents=overview.documents
    .filter(document=>!document.archivedAt&&document.links.length===0&&document.suggestions.length>0)
    .sort((a,b)=>{
      const scoreA=Math.max(...a.suggestions.map(item=>Number(item.score||0)),0);
      const scoreB=Math.max(...b.suggestions.map(item=>Number(item.score||0)),0);
      return scoreB-scoreA||String(b.documentDate||b.createdAt).localeCompare(String(a.documentDate||a.createdAt));
    });
  return {version:overview.version,total:documents.length,documents};
}
