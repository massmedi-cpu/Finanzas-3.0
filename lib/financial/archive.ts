import { createClient } from "@/lib/supabase/server";

export type ArchiveMatchConfidence="exact"|"high"|"medium"|"low";
export type ArchiveMatchMode="standard"|"installment";
export type ArchiveLifecycleState="new"|"pending"|"archived";
export type ArchivePendingReason="ocr_pending"|"ocr_processing"|"ocr_needs_review"|"ocr_failed"|"ocr_error"|"movement_match_pending";
export type ArchiveMovementRef = {
  sourceId:string;
  date:string|null;
  amount:number|null;
  concept:string|null;
  counterparty:string|null;
  score?:number;
  associationOrigin?:string|null;
  confidence?:number|null;
  confidenceTier?:ArchiveMatchConfidence;
  matchMode?:ArchiveMatchMode;
  amountDiff?:number|null;
  daysDiff?:number|null;
  merchantMatch?:boolean;
  candidateRank?:number;
  candidateCount?:number;
  scoreMargin?:number|null;
  autoEligible?:boolean;
  reasons?:string[];
};
export type ArchiveDocument = {
  id:string; fileName:string; mimeType:string|null; storageProvider?:string|null; storageUrl?:string|null; storagePath:string|null; fileSize:number|null; contentHash:string|null;
  documentType:string; documentDate:string|null; amount:number|null; merchant:string|null; ocrStatus:string; lifecycleState:ArchiveLifecycleState; pendingReasons:ArchivePendingReason[]; hasOcrText:boolean;
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
export type ArchiveLifecycleCounts={new:number;pending:number;archived:number};
export type ArchiveLifecycleOverview=ArchiveOverview&{state:ArchiveLifecycleState;counts:ArchiveLifecycleCounts};

async function archiveOverview(search:string|null,includeArchived:boolean,limit=200,offset=0):Promise<ArchiveOverview>{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_archive_overview",{p_search:search,p_limit:limit,p_offset:offset,p_include_archived:includeArchived});
  if(error||!data)throw new Error(error?.message||"archive_unavailable");
  const overview=data as ArchiveOverview;
  return {...overview,hasMore:offset+overview.documents.length<overview.total};
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
