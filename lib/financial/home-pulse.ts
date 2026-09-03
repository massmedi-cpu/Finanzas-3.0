import { APP_VERSION } from "@/lib/app-version";
import { createClient } from "@/lib/supabase/server";
import { asBoolean, asNumber, asRecord, asString, nullableString } from "@/lib/validation/json";

export type HomeReconciliation = {
  total: number;
  reconciled: number;
  pending: number;
  notReconciled: number;
  notApplicable: number;
};

export type HomePulse = {
  version: string;
  month: string;
  income: number;
  expenses: number;
  cashFlow: number;
  needsReview: number;
  reviewSource: number;
  lastMovementDate: string | null;
  reconciliation: HomeReconciliation;
  sync: {
    status: string;
    finishedAt: string | null;
    sourceModifiedAt: string | null;
    newCount: number;
    updatedCount: number;
    reviewCount: number;
  } | null;
  driveSync: {
    reconciliationPending: boolean;
    lastSyncAt: string | null;
    lastMode: string | null;
  };
  rules: {
    readOnly: boolean;
    singleTransactionPass: boolean;
    accountsExcludedFromCriticalPath: boolean;
  };
};

export async function getHomePulse(): Promise<HomePulse> {
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("financial_app_home_pulse");
  if(error||!data)throw new Error(error?.message||"home_pulse_unavailable");
  const raw=asRecord(data);
  const reconciliationRaw=asRecord(raw.reconciliation);
  const syncRaw=raw.sync==null?null:asRecord(raw.sync);
  const driveSyncRaw=asRecord(raw.driveSync);
  const rules=asRecord(raw.rules);
  return {
    version:asString(raw.version,APP_VERSION),
    month:asString(raw.month),
    income:asNumber(raw.income),
    expenses:asNumber(raw.expenses),
    cashFlow:asNumber(raw.cashFlow),
    needsReview:asNumber(raw.needsReview),
    reviewSource:asNumber(raw.reviewSource),
    lastMovementDate:nullableString(raw.lastMovementDate),
    reconciliation:{
      total:asNumber(reconciliationRaw.total),
      reconciled:asNumber(reconciliationRaw.reconciled),
      pending:asNumber(reconciliationRaw.pending),
      notReconciled:asNumber(reconciliationRaw.notReconciled),
      notApplicable:asNumber(reconciliationRaw.notApplicable),
    },
    sync:syncRaw?{
      status:asString(syncRaw.status),
      finishedAt:nullableString(syncRaw.finishedAt),
      sourceModifiedAt:nullableString(syncRaw.sourceModifiedAt),
      newCount:asNumber(syncRaw.newCount),
      updatedCount:asNumber(syncRaw.updatedCount),
      reviewCount:asNumber(syncRaw.reviewCount),
    }:null,
    driveSync:{
      reconciliationPending:asBoolean(driveSyncRaw.reconciliationPending),
      lastSyncAt:nullableString(driveSyncRaw.lastSyncAt),
      lastMode:nullableString(driveSyncRaw.lastMode),
    },
    rules:{
      readOnly:asBoolean(rules.readOnly),
      singleTransactionPass:asBoolean(rules.singleTransactionPass),
      accountsExcludedFromCriticalPath:asBoolean(rules.accountsExcludedFromCriticalPath),
    },
  };
}
