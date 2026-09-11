import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const route = readFileSync("app/api/data/deletion/route.ts", "utf8");
const panel = readFileSync("app/configuration/data/workspace-deletion-panel.tsx", "utf8");
const readinessHandler = readFileSync(
  "supabase/functions/financial-app-db-gateway/workspace-deletion-readiness.ts",
  "utf8",
);
const readinessMigration = readFileSync(
  "supabase/migrations/20260911090000_cr001_workspace_deletion_self_service_readiness.sql",
  "utf8",
);
const protocol = readFileSync("src/domain/workspace-deletion-protocol.ts", "utf8");

test("CR-001D · prepare/confirm/execute quedan detrás del kill-switch comercial", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato se valida una vez por run");

  const gate = route.indexOf("if (!selfServiceActive(readiness)) return unavailable(readiness)");
  const prepare = route.indexOf('"data.deletion_prepare_v1"');
  const confirm = route.indexOf('"data.deletion_confirm_v1"');
  const execute = route.indexOf('"data.deletion_execute_v1"');

  expect(gate).toBeGreaterThan(-1);
  expect(prepare).toBeGreaterThan(gate);
  expect(confirm).toBeGreaterThan(gate);
  expect(execute).toBeGreaterThan(gate);
  expect(route).toContain("commercialPolicyConfigured === true");
  expect(route).toContain("productionActivated === true");
  expect(route).toContain("selfServiceExecutionEndpointExposed === true");
  expect(route).toContain("readiness.canExecute !== true");
  expect(route).toContain("preview_production_deletion_forbidden");
});

test("CR-001D · cancelar sigue disponible como salida no destructiva", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato se valida una vez por run");

  const cancel = route.indexOf('requestedOperation === "cancel"');
  const commercialGate = route.indexOf("if (!selfServiceActive(readiness)) return unavailable(readiness)");
  expect(cancel).toBeGreaterThan(-1);
  expect(cancel).toBeLessThan(commercialGate);
  expect(route).toContain('"data.deletion_cancel_v1"');
});

test("CR-001D · UI exige doble acción separada y no autoejecuta tras confirmar", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato se valida una vez por run");

  expect(panel).toContain('const CONFIRMATION_TEXT = "ELIMINAR MIS DATOS"');
  expect(panel).toContain("Confirmación 1 de 2");
  expect(panel).toContain("Confirmación 2 de 2");
  expect(panel).toContain('setFlow("confirmed")');
  expect(panel).not.toMatch(/operation === "confirm"[\s\S]{0,500}?run\("execute"\)/);
  expect(panel).toContain("Eliminar definitivamente");
});

test("CR-001D · recibo se entrega inline y el cliente puede descargarlo", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato se valida una vez por run");

  expect(route).toContain('receiptDelivery: "inline_json"');
  expect(panel).toContain("new Blob([JSON.stringify(receipt, null, 2)]");
  expect(panel).toContain("Descargar recibo JSON");
  expect(protocol).toContain('mode: "inline_json_after_successful_execution"');
  expect(protocol).toContain("retentionPolicyRequiredBeforeExecution: true");
});

test("CR-001D · readiness sólo abre ejecución tras política activa + confirmación fresca", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "el contrato se valida una vez por run");

  expect(readinessMigration).toContain("'canExecute',(v_execution_enabled and v_confirmed_fresh)");
  expect(readinessMigration).toContain("'selfServiceExecutionEndpointExposed',true");
  expect(readinessMigration).toContain("'resolved',true");
  expect(readinessHandler).toContain("typeof readiness.canExecute !== \"boolean\"");
  expect(readinessHandler).toContain("selfServiceExecutionEndpointExposed: true");
  expect(protocol).toContain("commercialPolicyConfigured: false");
  expect(protocol).toContain("productionActivated: false");
});
