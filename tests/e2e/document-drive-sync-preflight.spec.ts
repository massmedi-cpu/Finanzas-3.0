import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("REC-DOC-AUTH-218 · Auto Drive jamás consulta la carpeta con cuenta de servicio antes de Auth", () => {
  const source = readFileSync("app/api/documents/drive-sync/route.ts", "utf8");
  const post = source.slice(source.indexOf("export async function POST()"));
  const previewGuard = post.indexOf('process.env.VERCEL_ENV === "preview"');
  const workspaceGuard = post.indexOf("await requireVerifiedSourceWorkspace()");
  const reader = post.indexOf("const readers = googleReaders()");
  const discover = post.indexOf("readers.discovery.listAuthorizedFolder");
  expect(previewGuard).toBeGreaterThan(-1);
  expect(workspaceGuard).toBeGreaterThan(previewGuard);
  expect(reader).toBeGreaterThan(workspaceGuard);
  expect(discover).toBeGreaterThan(reader);
  expect(post).toContain("if (accessDenied) return accessDenied;");
});

test("REC-DOC-AUTH-219 · Drive batch manual verifica sesión antes de descargar cualquier fichero", () => {
  const source = readFileSync("app/api/documents/route.ts", "utf8");
  const branch = source.slice(source.indexOf('if (action === "drive_batch")'));
  const previewGuard = branch.indexOf('process.env.VERCEL_ENV === "preview"');
  const workspaceGuard = branch.indexOf("await requireVerifiedSourceWorkspace()");
  const firstDownload = branch.indexOf("const downloader = driveDownloader()");
  const batchCommit = branch.indexOf('callPersistenceGateway("document.drive_batch"');
  expect(previewGuard).toBeGreaterThan(-1);
  expect(workspaceGuard).toBeGreaterThan(previewGuard);
  expect(firstDownload).toBeGreaterThan(workspaceGuard);
  expect(batchCommit).toBeGreaterThan(firstDownload);
  expect(branch).toContain("if (accessDenied) return accessDenied;");
  // No browser POST against a production-backed preview is needed: a broken
  // guard must not turn a security test into a real document import.
});

test("REC-DOC-AUTH-220 · la credencial de Google solo se consulta tras verificar identidad", () => {
  const automatic = readFileSync("app/api/documents/drive-sync/route.ts", "utf8");
  const branch = automatic.slice(automatic.indexOf("export async function POST()"));
  expect(branch.indexOf("const readers = googleReaders()"))
    .toBeGreaterThan(branch.indexOf("await requireVerifiedSourceWorkspace()"));
  expect(automatic).toContain("getGoogleServiceAccountCredentialsFromEnvironment");
});
