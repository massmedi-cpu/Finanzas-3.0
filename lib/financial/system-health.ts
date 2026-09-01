import { createClient } from "@/lib/supabase/server";
import { asBoolean,asNumber,asRecord } from "@/lib/validation/json";
import { getHomePulse } from "@/lib/financial/home-pulse";

export type SystemHealthSnapshot={
  ok:boolean;
  sync:{
    status:string;
    sourceModifiedAt:string|null;
    lastSyncAt:string|null;
    reconciliationPending:boolean;
  };
  documents:{
    ok:boolean;
    active:number;
    pending:number;
    archived:number;
    cleanupPending:number;
    missingOriginals:number;
    orphanStorageObjects:number;
    duplicateLinks:number;
  };
};

export async function getSystemHealthSnapshot():Promise<SystemHealthSnapshot>{
  const supabase=await createClient();
  const [pulse,{data:documentHealth,error}]=await Promise.all([
    getHomePulse(),
    supabase.rpc("financial_app_document_lifecycle_health"),
  ]);
  if(error||!documentHealth)throw new Error(error?.message||"document_lifecycle_health_unavailable");
  const raw=asRecord(documentHealth);
  const documents={
    ok:asBoolean(raw.ok),
    active:asNumber(raw.active),
    pending:asNumber(raw.pending),
    archived:asNumber(raw.archived),
    cleanupPending:asNumber(raw.cleanupPending),
    missingOriginals:asNumber(raw.missingOriginals),
    orphanStorageObjects:asNumber(raw.orphanStorageObjects),
    duplicateLinks:asNumber(raw.duplicateLinks),
  };
  return {
    ok:documents.ok&&!pulse.driveSync.reconciliationPending&&pulse.sync?.status!=="failed",
    sync:{
      status:pulse.sync?.status||"unknown",
      sourceModifiedAt:pulse.sync?.sourceModifiedAt||null,
      lastSyncAt:pulse.driveSync.lastSyncAt,
      reconciliationPending:pulse.driveSync.reconciliationPending,
    },
    documents,
  };
}
