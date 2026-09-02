"use client";

import type { ArchiveOverview } from "@/lib/financial/archive";
import { ArchiveBulkOcrRecovery } from "./archive-bulk-ocr-recovery";
import { ArchiveClient as ArchiveClientCore } from "./archive-client";

function archiveRefreshKey(data:ArchiveOverview){
  return [data.version,...data.documents.map(document=>`${document.id}:${document.updatedAt}:${document.ocrStatus}`)].join("|");
}

function initialRecoveryCount(data:ArchiveOverview){
  return data.documents.filter(document=>
    document.mimeType?.startsWith("image/")
    && document.storageProvider==="supabase_storage"
    && document.links.length===0
    && ["needs_review","failed","error"].includes(document.ocrStatus)
  ).length;
}

export function ArchiveClient({initialData}:{initialData:ArchiveOverview}){
  const refreshKey=archiveRefreshKey(initialData);
  const recoveryCount=initialRecoveryCount(initialData);
  return <>
    <ArchiveBulkOcrRecovery key={`bulk:${refreshKey}`} initialCount={recoveryCount}/>
    <ArchiveClientCore key={refreshKey} initialData={initialData}/>
  </>;
}
