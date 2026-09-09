import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { WORKSPACE_EXPORT_CONTRACT } from "../../src/domain/data-export-contract";
import { DATA_TRUST_CAPABILITIES } from "../../src/domain/data-trust-contract";

const migration = readFileSync(
  "supabase/migrations/20260909213000_pre020_workspace_structured_export.sql",
  "utf8",
);

test("PRE-020B · el contrato de exportación incluye datos de negocio y excluye fuentes sensibles", () => {
  expect(WORKSPACE_EXPORT_CONTRACT.contractVersion).toBe(1);
  expect(WORKSPACE_EXPORT_CONTRACT.format).toBe("financial-app-workspace-json");
  expect(WORKSPACE_EXPORT_CONTRACT.locale).toBe("es-ES");
  expect(WORKSPACE_EXPORT_CONTRACT.currency).toBe("EUR");
  expect(WORKSPACE_EXPORT_CONTRACT.timeZone).toBe("Europe/Madrid");
  expect(WORKSPACE_EXPORT_CONTRACT.includedDatasets).toContain("transactionSourceRecords");
  expect(WORKSPACE_EXPORT_CONTRACT.includedDatasets).toContain("documents");
  expect(WORKSPACE_EXPORT_CONTRACT.includedDatasets).toContain("auditChanges");
  expect(WORKSPACE_EXPORT_CONTRACT.excludedSensitiveSources).toContain("google_oauth_connections");
  expect(WORKSPACE_EXPORT_CONTRACT.excludedSensitiveSources).toContain("authorized_users");
  expect(WORKSPACE_EXPORT_CONTRACT.excludedSensitiveSources).toContain("vault.secrets");
  expect(WORKSPACE_EXPORT_CONTRACT.limitations).toContain("document_binaries_not_included");
  expect(WORKSPACE_EXPORT_CONTRACT.previewProductionAccess).toBe("forbidden");
});

test("PRE-020B · la función SQL hereda RLS y no consulta tablas sensibles", () => {
  expect(migration.toLowerCase()).toContain("security invoker");
  expect(migration.toLowerCase()).toContain("stable");
  expect(migration).toContain("financial_app.require_current_workspace_id()");
  expect(migration).toContain("grant execute on function financial_app.export_current_workspace_data() to financial_app_gateway");
  expect(migration).toContain("revoke all on function financial_app.export_current_workspace_data() from public");
  expect(migration).toContain("from financial_app.transaction_source_records");
  expect(migration).not.toContain("from financial_app.google_oauth_connections");
  expect(migration).not.toContain("from financial_app.authorized_users");
  expect(migration).not.toContain("from vault.");
});

test("PRE-020B · la UI no anuncia aún la exportación como disponible", () => {
  const exportCapability = DATA_TRUST_CAPABILITIES.find((capability) => capability.id === "user-data-export");
  expect(exportCapability?.state).toBe("not_available");
  expect(exportCapability?.evidence).toHaveLength(0);
});
