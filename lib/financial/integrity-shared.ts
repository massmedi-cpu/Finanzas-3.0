export type IntegrityStatus = "healthy" | "warning" | "critical";
export type IntegrityCheckStatus = "pass" | "warning" | "fail";

export type IntegrityCheck = {
  key: string;
  label: string;
  status: IntegrityCheckStatus;
  detail: string;
};

export type IntegritySnapshot = {
  version: string;
  generatedAt: string;
  status: IntegrityStatus;
  deep: boolean;
  fingerprint: string;
  sourceChecksum: string | null;
  checks: IntegrityCheck[];
  source: {
    mode: string | null;
    fileConfigured: boolean;
    transactions: number;
    missingHashes: number;
    sourceMissing: number;
    duplicateSourceIds: number;
    duplicateFlagged: number;
  };
  quality: { needsReview: number; missingAccount: number; orphanAccount: number };
  sync: { status: string | null; startedAt: string | null; newCount: number; updatedCount: number; reviewCount: number };
  privateLayers: { editedTransactions: number; historyRows: number; splits: number; rules: number; ruleApplications: number; monthCloses: number; alertStates: number };
  infrastructure: { activeAccounts: number; archivePrivate: boolean; archiveFileSizeLimit: number | null };
};

export type IntegrityAuditHistory = {
  id: number;
  status: IntegrityStatus;
  fingerprint: string;
  sourceChecksum: string | null;
  createdAt: string;
  checks: IntegrityCheck[];
};

export type IntegrityOverview = {
  current: IntegritySnapshot;
  history: IntegrityAuditHistory[];
  persistent: boolean;
  readOnlyOnLoad: boolean;
};

export const INTEGRITY_STATUS_LABEL: Record<IntegrityStatus, string> = {
  healthy: "Correcto",
  warning: "Revisión recomendada",
  critical: "Atención crítica",
};

export const INTEGRITY_CHECK_LABEL: Record<IntegrityCheckStatus, string> = {
  pass: "Correcto",
  warning: "Aviso",
  fail: "Fallo",
};

export function summarizeIntegrityChecks(checks: IntegrityCheck[]) {
  return checks.reduce((summary, check) => {
    summary[check.status] += 1;
    return summary;
  }, { pass: 0, warning: 0, fail: 0 });
}

export function shortFingerprint(value: string | null | undefined) {
  return value ? value.slice(0, 12) : "—";
}
