import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { classifyVerifiedDriveName, inferDocumentType } from "../../src/application/document-drive-file-type";

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

test("REC-DOC-DRIVE-TYPE-301 · classify filenames with underscores, digits and accents", () => {
  for (const name of [
    "Factura_2026-11.pdf", "FACTURA2026.PDF", "mi_factura_11.pdf",
    "fáctura-noviembre.pdf", "Invoice_004.pdf", "invoice2026.pdf",
  ]) {
    expect(inferDocumentType(name), name).toBe("invoice");
  }
  for (const name of [
    "ticket_2026.jpg", "Ticket2026.jpg", "tique_2026.pdf",
    "Recibo_2026.pdf", "recibo2026.pdf",
  ]) {
    expect(inferDocumentType(name), name).toBe("ticket");
  }
});

test("REC-DOC-DRIVE-TYPE-302 · avoid false positives inside words and preserve other", () => {
  for (const name of [
    "prefactura.pdf", "facturacion-noviembre.pdf", "facturita.pdf",
    "ticketera.jpg", "misrecibos.pdf", "documento_general.pdf",
    "contrato2026.pdf",
  ]) {
    expect(inferDocumentType(name), name).toBe("other");
  }
  expect(inferDocumentType("factura-ticket.pdf")).toBe("invoice");
  expect(inferDocumentType("tiqué_2026.jpg")).toBe("ticket");
});

test("REC-DOC-DRIVE-TYPE-303 · downloaded authoritative name decides document type", () => {
  expect(classifyVerifiedDriveName("contrato_2026.pdf", "Factura_2026.pdf"))
    .toEqual({ name: "Factura_2026.pdf", type: "invoice" });
  expect(classifyVerifiedDriveName("Ticket_2026.jpg", "contrato_2026.jpg"))
    .toEqual({ name: "contrato_2026.jpg", type: "other" });
  expect(classifyVerifiedDriveName("factura_2026.pdf", null))
    .toEqual({ name: "factura_2026.pdf", type: "invoice" });
  const source = readFileSync("app/api/documents/drive-sync/route.ts", "utf8");
  expect(source).toContain("verified[position] = {");
  expect(source).toContain("...classifyVerifiedDriveName(candidate.name, downloaded.fileName)");
  expect(source).toContain("verified.filter((item): item is SyncCandidate => item !== undefined)");
  expect(source).not.toContain("verified.push(");
});
