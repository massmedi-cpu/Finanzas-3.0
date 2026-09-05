import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("una revisión inmutable ya validada usa replay set-based y conserva trazabilidad", () => {
  const router = readFileSync(
    "supabase/functions/financial-app-db-gateway/source-sync-router.ts",
    "utf8",
  );
  const gateway = readFileSync(
    "supabase/functions/financial-app-db-gateway/index.ts",
    "utf8",
  );

  expect(gateway).toContain('from "./source-sync-router.ts"');
  expect(router).toContain('source_revision=${batch.sourceRevision}');
  expect(router).toContain('schema_fingerprint=${batch.schemaFingerprint}');
  expect(router).toContain('from unnest(${sourceRowIdentities}::text[],${sourceFingerprints}::text[])');
  expect(router).toContain('sr.source_fingerprint=expected.source_fingerprint');
  expect(router).toContain("rows_skipped,rows_failed,duplicates_detected,warnings_count");
  expect(router).toContain("stableRevisionReplay: true");
  expect(router).toContain("pg_advisory_xact_lock");
});

test("el replay estable falla de vuelta al motor completo si no coincide toda la fotografía persistida", () => {
  const router = readFileSync(
    "supabase/functions/financial-app-db-gateway/source-sync-router.ts",
    "utf8",
  );

  expect(router).toContain("if (snapshotRows[0]?.matched !== batch.observations.length) return;");
  expect(router).toContain("if (mappingRows.length !== accountExternalKeys.length) return;");
  expect(router).toContain("if (cursorRows.length !== lastRowBySheet.size) return;");
  expect(router).toContain("return handleLegacySourceSyncAction(input);");
});
