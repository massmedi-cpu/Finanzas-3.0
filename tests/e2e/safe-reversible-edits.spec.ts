import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("Movimientos conserva el banco inmutable y hace reversibles los ajustes manuales", () => {
  const client = source("app/transactions/transactions-client.tsx");
  const gateway = source("supabase/functions/financial-app-db-gateway/transaction-management.ts");

  expect(client).toContain("sin alterar el origen bancario");
  expect(client).toContain("Cada cambio manual se");
  expect(client).toContain("guarda como override separado");
  expect(client).toContain("Restaurar valor detectado:");
  expect(client).toContain("Restaurar clasificación detectada");
  expect(client).toContain('merchantMode: "inherit"');
  expect(client).toContain('categoryMode: "inherit"');
  expect(client).toContain('kindMode: "inherit"');

  expect(gateway).toContain("financial_app.apply_transaction_override_patch");
  expect(gateway).toContain('concept: null');
  expect(gateway).toContain('merchantMode: "inherit"');
  expect(gateway).toContain('categoryMode: "inherit"');
  expect(gateway).toContain('reviewState: null');
  expect(gateway).toContain('note: null');
  expect(gateway).toContain("test_transaction_management_clear_override_failed");
  expect(gateway).toContain("test_transaction_management_source_mutated");
});

test("Las ediciones son trazables, idempotentes y cancelables antes de guardar", () => {
  const client = source("app/transactions/transactions-client.tsx");
  const gateway = source("supabase/functions/financial-app-db-gateway/transaction-management.ts");

  expect(client).toContain("function cancelEdit()");
  expect(client).toContain(">Cancelar</button>");
  expect(client).toContain("Detalle y trazabilidad");
  expect(client).toContain("Concepto original");
  expect(client).toContain("Concepto efectivo");
  expect(client).toContain("Fingerprint");

  expect(gateway).toContain("auditChanges");
  expect(gateway).toContain("test_transaction_management_idempotence_failed");
  expect(gateway).toContain("financial_app.audit_changes");
  expect(gateway).toContain("change_origin='user'");
});

test("La recuperación global no reactiva borrados destructivos ni sustituye la fuente bancaria", () => {
  const backup = source("tests/e2e/backup-restore-v2.spec.ts");
  const rehearsal = source("scripts/phase13-restore-rehearsal-v2.sh");

  expect(backup).toContain("deletionMustBeReapprovedAfterRestore: true");
  expect(backup).toContain("deletionMustBeReapprovedAfterRestore !== true");
  expect(rehearsal).toContain("bank_source_policy");
  expect(rehearsal).toContain("deletion_policy_rows");
});
