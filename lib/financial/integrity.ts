import { createClient } from "@/lib/supabase/server";
import type { IntegrityAuditHistory, IntegrityCheck, IntegrityCheckStatus, IntegrityOverview, IntegritySnapshot, IntegrityStatus } from "@/lib/financial/integrity-shared";

export type { IntegrityAuditHistory, IntegrityCheck, IntegrityOverview, IntegritySnapshot } from "@/lib/financial/integrity-shared";

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const nullableText = (value: unknown) => typeof value === "string" && value.length ? value : null;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullableNumber = (value: unknown) => value === null || value === undefined ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const bool = (value: unknown, fallback = false) => typeof value === "boolean" ? value : fallback;
const status = (value: unknown): IntegrityStatus => value === "critical" || value === "warning" || value === "healthy" ? value : "critical";
const checkStatus = (value: unknown): IntegrityCheckStatus => value === "pass" || value === "warning" || value === "fail" ? value : "fail";

function normalizeChecks(value: unknown): IntegrityCheck[] {
  return Array.isArray(value) ? value.map(item => {
    const raw = record(item);
    return { key: text(raw.key), label: text(raw.label, "Comprobación"), status: checkStatus(raw.status), detail: text(raw.detail) };
  }).filter(item => item.key) : [];
}

function normalizeSnapshot(value: unknown): IntegritySnapshot {
  const raw = record(value);
  const source = record(raw.source);
  const quality = record(raw.quality);
  const sync = record(raw.sync);
  const privateLayers = record(raw.privateLayers);
  const infrastructure = record(raw.infrastructure);
  return {
    version: text(raw.version),
    generatedAt: text(raw.generatedAt),
    status: status(raw.status),
    deep: bool(raw.deep),
    fingerprint: text(raw.fingerprint),
    sourceChecksum: nullableText(raw.sourceChecksum),
    checks: normalizeChecks(raw.checks),
    source: {
      mode: nullableText(source.mode), fileConfigured: bool(source.fileConfigured), transactions: number(source.transactions),
      missingHashes: number(source.missingHashes), sourceMissing: number(source.sourceMissing), duplicateSourceIds: number(source.duplicateSourceIds), duplicateFlagged: number(source.duplicateFlagged),
    },
    quality: { needsReview: number(quality.needsReview), missingAccount: number(quality.missingAccount), orphanAccount: number(quality.orphanAccount) },
    sync: { status: nullableText(sync.status), startedAt: nullableText(sync.startedAt), newCount: number(sync.newCount), updatedCount: number(sync.updatedCount), reviewCount: number(sync.reviewCount) },
    privateLayers: {
      editedTransactions: number(privateLayers.editedTransactions), historyRows: number(privateLayers.historyRows), splits: number(privateLayers.splits),
      rules: number(privateLayers.rules), ruleApplications: number(privateLayers.ruleApplications), monthCloses: number(privateLayers.monthCloses), alertStates: number(privateLayers.alertStates),
    },
    infrastructure: { activeAccounts: number(infrastructure.activeAccounts), archivePrivate: bool(infrastructure.archivePrivate), archiveFileSizeLimit: nullableNumber(infrastructure.archiveFileSizeLimit) },
  };
}

export function normalizeIntegrityOverview(value: unknown): IntegrityOverview {
  const raw = record(value);
  const history: IntegrityAuditHistory[] = Array.isArray(raw.history) ? raw.history.map(item => {
    const entry = record(item);
    return {
      id: number(entry.id), status: status(entry.status), fingerprint: text(entry.fingerprint), sourceChecksum: nullableText(entry.sourceChecksum),
      createdAt: text(entry.createdAt), checks: normalizeChecks(entry.checks),
    };
  }) : [];
  return { current: normalizeSnapshot(raw.current), history, persistent: bool(raw.persistent), readOnlyOnLoad: bool(raw.readOnlyOnLoad, true) };
}

export async function getSystemIntegrityOverview(): Promise<IntegrityOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("financial_app_system_integrity");
  if (error || !data) throw new Error(error?.message || "system_integrity_unavailable");
  return normalizeIntegrityOverview(data);
}
