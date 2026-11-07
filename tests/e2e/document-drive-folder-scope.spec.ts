import { expect, test } from "@playwright/test";
import {
  DocumentDriveFolderScopeError,
  discoverAuthorizedDocumentFolders,
  resolveAuthorizedDocumentFolders,
} from "../../src/application/document-drive-folder-scope";

const FIRST = "A".repeat(24);
const SECOND = "B".repeat(24);
const THIRD = "C".repeat(24);
const file = (id: string) => ({
  fileId: id,
  name: "Documento de prueba.pdf",
  mimeType: "application/pdf",
  sizeBytes: 128,
  modifiedTime: "2026-10-20T08:00:00.000Z",
});
const folderResult = (ids: string[], truncated = false) => ({
  files: ids.map(file),
  skippedUnsupported: 0,
  skippedInvalid: 0,
  truncated,
});

test("REC-DOC-SCOPE-221 · configuración ausente mantiene la única carpeta original", () => {
  expect(resolveAuthorizedDocumentFolders(undefined, FIRST)).toEqual([FIRST]);
  expect(resolveAuthorizedDocumentFolders(" ", FIRST)).toEqual([FIRST]);
});

test("REC-DOC-SCOPE-222 · carpetas privadas adicionales solo en configuración validada", () => {
  expect(resolveAuthorizedDocumentFolders(` ${FIRST},${SECOND} `, THIRD)).toEqual([FIRST, SECOND]);
  for (const bad of [`${FIRST},${FIRST}`, `${FIRST},`, "fake;extra", "/shared/path", Array(13).fill(FIRST).join(",")]) {
    expect(() => resolveAuthorizedDocumentFolders(bad, FIRST))
      .toThrow(DocumentDriveFolderScopeError);
  }
});

test("REC-DOC-SCOPE-223 · combina documentos de carpetas con inventario íntegro", async () => {
  const seen: string[] = [];
  const result = await discoverAuthorizedDocumentFolders([FIRST, SECOND], async (id) => {
    seen.push(id);
    return id === FIRST ? { ...folderResult([THIRD]), skippedUnsupported: 1 } : folderResult([SECOND]);
  });
  expect(seen).toEqual([FIRST, SECOND]);
  expect(result.files.map((item) => item.fileId)).toEqual([THIRD, SECOND]);
  expect(result.skippedUnsupported).toBe(1);
  expect(result.truncated).toBe(false);
});

test("REC-DOC-SCOPE-224 · no importa parcialmente si falta una carpeta o hay duplicados", async () => {
  const duplicate = () => discoverAuthorizedDocumentFolders([FIRST, SECOND], async () => folderResult([THIRD]));
  const truncated = () => discoverAuthorizedDocumentFolders([FIRST], async () => folderResult([THIRD], true));
  const unavailable = () => discoverAuthorizedDocumentFolders([FIRST, SECOND], async (id) => {
    if (id === SECOND) throw new Error("Drive no está disponible");
    return folderResult([THIRD]);
  });
  await expect(duplicate()).rejects.toThrow("document_drive_folder_duplicate_or_invalid_file");
  await expect(truncated()).rejects.toThrow("document_drive_folder_inventory_incomplete");
  await expect(unavailable()).rejects.toThrow("Drive no está disponible");
});

test("REC-DOC-SCOPE-225 · 2.001 ficheros requieren revisar alcance, nunca importación parcial", async () => {
  const many = Array.from({ length: 2001 }, (_, i) => i.toString(36).padStart(20, "0"));
  await expect(discoverAuthorizedDocumentFolders([FIRST], async () => folderResult(many)))
    .rejects.toThrow("document_drive_folder_inventory_incomplete");
});

test("REC-DOC-SCOPE-226 · rechaza el identificador de carpeta inválido antes de leer Drive", async () => {
  let requests = 0;
  await expect(discoverAuthorizedDocumentFolders(["https://drive.google.com/fake"], async () => {
    requests++;
    return folderResult([]);
  })).rejects.toThrow("document_drive_folder_scope_invalid");
  expect(requests).toBe(0);
});
