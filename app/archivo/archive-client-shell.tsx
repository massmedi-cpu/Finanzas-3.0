"use client";

import type { ArchiveOverview } from "@/lib/financial/archive";
import { ArchiveClient as ArchiveClientCore } from "./archive-client";

function archiveRefreshKey(data:ArchiveOverview){
  return [data.version,...data.documents.map(document=>`${document.id}:${document.updatedAt}:${document.ocrStatus}`)].join("|");
}

export function ArchiveClient({initialData}:{initialData:ArchiveOverview}){
  const refreshKey=archiveRefreshKey(initialData);
  return <ArchiveClientCore key={refreshKey} initialData={initialData}/>;
}
