import { expect, test } from "@playwright/test";
import { GoogleDriveDocumentDiscovery } from "../../src/infrastructure/google/google-drive-document-discovery";
import {
  discoverAuthorizedDocumentFolders,
  DocumentDriveFolderScopeError,
} from "../../src/application/document-drive-folder-scope";

const ROOT = "R".repeat(24);
const CHILD = "C".repeat(24);
const DEEP = "D".repeat(24);
const OTHER = "O".repeat(24);
const doc = (id: string) => ({
  fileId: id, name: "Documento sintético.pdf",
  mimeType: "application/pdf", sizeBytes: 123,
  modifiedTime: "2026-10-20T08:00:00.000Z",
});
const files = (...ids: string[]) => ({
  files: ids.map(doc), skippedInvalid: 0,
  skippedUnsupported: 0, truncated: false,
});

test("REC-DOC-SCOPE-227 · árbol autorizado incluye subcarpetas por años sin buscar todo Drive", async () => {
  const scanned: string[] = [];
  const result = await discoverAuthorizedDocumentFolders([ROOT], async (id) => {
    scanned.push(id);
    return id === ROOT ? files() : id === CHILD ? files(OTHER) : files(DEEP);
  }, async (id) => id === ROOT ? [CHILD] : id === CHILD ? [DEEP] : []);
  expect(scanned).toEqual([ROOT, CHILD, DEEP]);
  expect(result.files.map((item) => item.fileId)).toEqual([OTHER, DEEP]);
});

test("REC-DOC-SCOPE-228 · sin árbol conserva estrictamente el primer nivel", async () => {
  const scanned: string[] = [];
  await discoverAuthorizedDocumentFolders([ROOT], async (id) => {
    scanned.push(id);
    return files(OTHER);
  });
  expect(scanned).toEqual([ROOT]);
});

test("REC-DOC-SCOPE-229 · ciclo y raíz repetida rechazan por completo el inventario", async () => {
  await expect(discoverAuthorizedDocumentFolders([ROOT], async () => files(),
    async () => [ROOT])).rejects.toThrow("document_drive_folder_tree_incomplete");
  await expect(discoverAuthorizedDocumentFolders([ROOT], async () => files(),
    async (id) => id === ROOT ? [CHILD] : [ROOT])).rejects.toThrow("document_drive_folder_tree_incomplete");
});

test("REC-DOC-SCOPE-230 · rechaza superar los seis niveles autorizados", async () => {
  const ids = Array.from({ length: 8 }, (_, i) => String(i + 1).repeat(24));
  const next = new Map(ids.slice(0, -1).map((id, i) => [id, ids[i + 1]]));
  await expect(discoverAuthorizedDocumentFolders([ids[0]], async () => files(),
    async (id) => next.has(id) ? [next.get(id)!] : []))
    .rejects.toThrow("document_drive_folder_tree_incomplete");
});

test("REC-DOC-SCOPE-231 · rechaza 101 carpetas sin importar parcialmente", async () => {
  const ids = Array.from({ length: 101 }, (_, i) => i.toString(36).padStart(20, "A"));
  await expect(discoverAuthorizedDocumentFolders([ROOT], async () => files(),
    async (id) => id === ROOT ? ids : []))
    .rejects.toThrow("document_drive_folder_tree_incomplete");
});

test("REC-DOC-SCOPE-232 · metadatos omitidos invalidan incluso una carpeta anterior correcta", async () => {
  await expect(discoverAuthorizedDocumentFolders([ROOT, CHILD],
    async (id) => id === CHILD ? { ...files(OTHER), skippedInvalid: 1 } : files(DEEP)))
    .rejects.toThrow("document_drive_folder_inventory_incomplete");
});

test("REC-DOC-SCOPE-233 · consulta a Google restringida al padre, cursor completo y fallo cerrado", async () => {
  const urls: URL[] = [];
  const pages = [
    { files: [{ id: CHILD, mimeType: "application/vnd.google-apps.folder" }], nextPageToken: "page2" },
    { files: [{ id: DEEP, mimeType: "application/vnd.google-apps.folder" }] },
  ];
  const provider = { getAccessToken: async () => "synthetic-readonly" };
  const reader = new GoogleDriveDocumentDiscovery(provider, (async (url: RequestInfo | URL, options?: RequestInit) => {
    const requestUrl = new URL(String(url));
    urls.push(requestUrl);
    expect(options?.method).toBe("GET");
    expect(options?.headers).toHaveProperty("authorization", "Bearer synthetic-readonly");
    return Response.json(pages[urls.length - 1] ?? { files: [] });
  }) as typeof fetch);
  expect(await reader.listAuthorizedChildFolders(ROOT)).toEqual([CHILD, DEEP]);
  expect(urls).toHaveLength(2);
  for (const url of urls) {
    expect(url.searchParams.get("q")).toBe(
      `'${ROOT}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
  }
  const dup = new GoogleDriveDocumentDiscovery(provider,
    (async () => Response.json({ files: [{ id: CHILD, mimeType: "application/vnd.google-apps.folder" },
      { id: CHILD, mimeType: "application/vnd.google-apps.folder" }] })) as typeof fetch);
  await expect(dup.listAuthorizedChildFolders(ROOT))
    .rejects.toThrow("Hay una subcarpeta inválida");
});
