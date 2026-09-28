import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

test("10.0.22 persiste rowsMissing desde PostgreSQL hasta Inicio", () => {
  const migration = read("supabase/migrations/20260926193000_persist_sync_missing_rows.sql");
  const gateway = read("supabase/functions/financial-app-db-gateway/source-sync.ts");
  const replay = read("supabase/functions/financial-app-db-gateway/source-sync-router.ts");
  const route = read("app/api/source/google/sync/route.ts");
  const home = read("app/inicio-overview.tsx");
  const incidents = read("src/application/source-sync-incidents.ts");

  expect(migration).toContain("add column if not exists rows_missing integer not null default 0");
  expect(migration).toContain("check (rows_missing >= 0)");

  expect(gateway).toContain("rows_missing=${missingRows.length}");
  expect(gateway).toContain("rows_revised,rows_skipped,rows_failed,rows_missing,duplicates_detected,warnings_count");
  expect(replay).toContain("rows_skipped,rows_failed,rows_missing,duplicates_detected,warnings_count");

  expect(route).toContain("rows_missing: number;");
  expect(route).toContain("rowsMissing: status.run.rows_missing");

  expect(home).toContain("rowsMissing: number;");
  expect(home).toContain("normalizeSourceSyncIncidents(run)");
  expect(incidents).toContain("const missingRows = nonNegativeCount(value?.rowsMissing);");
  expect(home).toContain("movimiento importado anteriormente ya no aparece en la fuente");
});

test("10.0.22 no confunde filas ausentes con avisos adicionales", () => {
  const home = read("app/inicio-overview.tsx");
  const incidents = read("src/application/source-sync-incidents.ts");
  expect(incidents).toContain("additionalWarnings: Math.max(0, warnings - missingRows)");
  expect(home).toContain("incidents.additionalWarnings");
});
