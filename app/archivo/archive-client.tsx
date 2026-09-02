"use client";

import type { ArchiveOverview } from "@/lib/financial/archive";
import { ArchiveBulkOcrRecovery } from "./archive-bulk-ocr-recovery";
import { ArchiveClient as ArchiveClientCore } from "./archive-client-core";

function archiveRefreshKey(data:ArchiveOverview){
  return [data.version,...data.documents.map(document=>`${document.id}:${document.updatedAt}:${document.ocrStatus}`)].join("|");
}

export function ArchiveClient({initialData}:{initialData:ArchiveOverview}){
  const refreshKey=archiveRefreshKey(initialData);
  return <>
    <ArchiveBulkOcrRecovery refreshKey={refreshKey}/>
    <ArchiveClientCore key={refreshKey} initialData={initialData}/>
  </>;
}
