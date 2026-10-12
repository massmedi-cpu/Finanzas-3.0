import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchesPrivateDocumentReplay } from "../../src/domain/private-document-replay";

const registered = {
  type: "invoice",
  originalFileName: "factura-revisada.pdf",
  mimeType: "application/pdf",
  sizeBytes: 12345,
};

test("REC-DOC-110 · idempotent registration preserves exact original identity", () => {
  expect(matchesPrivateDocumentReplay(registered, { ...registered })).toBe(true);
});

for (const [title, changed] of [
  ["type", { type: "ticket" }],
  ["filename", { originalFileName: "otra-factura.pdf" }],
  ["MIME", { mimeType: "image/png" }],
  ["content length", { sizeBytes: 12346 }],
  ["missing original length", { sizeBytes: null }],
  ["zero length", { sizeBytes: 0 }],
  ["fractional length", { sizeBytes: 1.5 }],
  ["unsafe length", { sizeBytes: Number.MAX_SAFE_INTEGER + 1 }],
] as const) {
  test(`REC-DOC-111 · immutable private replay rejects ${title}`, () => {
    expect(matchesPrivateDocumentReplay(registered, { ...registered, ...changed })).toBe(false);
  });
}

test("REC-DOC-112 · gateway validates private Storage before immutable database registration", () => {
  const source = readFileSync(join(
    process.cwd(), "supabase/functions/financial-app-db-gateway/document-logic.ts",
  ), "utf8");
  const bypass = source.indexOf('if (action === "document.register")');
  const handler = source.indexOf('if (action === "document.upload_finalize")');
  const downloaded = source.indexOf(".download(path)", handler);
  const digest = source.indexOf('crypto.subtle.digest("SHA-256", bytes)', handler);
  const lock = source.indexOf("pg_advisory_xact_lock", handler);
  const match = source.indexOf("matchesPrivateDocumentReplay", handler);
  const upsert = source.indexOf("financial_app.register_document(", handler);
  const transaction = source.indexOf("sql.begin(async", handler);
  const replayError = source.indexOf("document_upload_replay_conflict", handler);

  expect(bypass).toBeGreaterThanOrEqual(0);
  expect(bypass).toBeLessThan(handler);
  expect(source.slice(bypass, handler)).toContain("document_registration_requires_verified_source");
  expect(source.slice(bypass, handler)).not.toContain("financial_app.register_document(");
  expect(downloaded).toBeGreaterThan(handler);
  expect(digest).toBeGreaterThan(downloaded);
  expect(transaction).toBeGreaterThan(digest);
  expect(lock).toBeGreaterThan(transaction);
  expect(match).toBeGreaterThan(lock);
  expect(upsert).toBeGreaterThan(match);
  expect(replayError).toBeGreaterThan(upsert);
  expect(source).toContain("for update");
  expect(source).toContain("workspace_id=${workspaceId}::uuid");
});

test("REC-DOC-120 · direct private document open is workspace scoped", () => {
  const source = readFileSync(join(
    process.cwd(), "supabase/functions/financial-app-db-gateway/document-logic.ts",
  ), "utf8");
  const begin = source.indexOf('if (action === "document.open")');
  const end = source.indexOf('if (action === "document.drive_batch")', begin);
  expect(begin).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(begin);
  const open = source.slice(begin, end);
  expect(open).toContain("const workspaceId = await currentWorkspaceId(sql)");
  expect(open).toContain("where id=${id}::uuid and workspace_id=${workspaceId}::uuid");
  expect(open).toContain('row.storage_provider !== "google_drive" && row.storage_provider !== "supabase"');
  expect(open).toContain('document_not_found');
});
