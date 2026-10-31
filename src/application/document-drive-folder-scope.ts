import type { DiscoveredDriveDocument, GoogleDriveDocumentDiscoveryResult } from "../infrastructure/google/google-drive-document-discovery";

const MAX_AUTHORIZED_FOLDERS = 12;
const MAX_DISCOVERED_FILES = 2000;
const MAX_TRAVERSED_FOLDERS = 100;
const MAX_FOLDER_DEPTH = 6;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export class DocumentDriveFolderScopeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "DocumentDriveFolderScopeError";
    this.code = code;
  }
}

/**
 * Additional Drive folders are configured server-side only. Never derive
 * private folder scope from a browser-supplied URL, cookie or request body.
 * An empty value leaves the original, reviewed folder unchanged.
 */
export function resolveAuthorizedDocumentFolders(raw: string | undefined, fallbackId: string): string[] {
  const value = raw === undefined || raw.trim() === "" ? fallbackId : raw;
  const ids = value.split(",").map((item) => item.trim());
  if (ids.length < 1 || ids.length > MAX_AUTHORIZED_FOLDERS
    || ids.some((id) => !DRIVE_ID.test(id))
    || new Set(ids).size !== ids.length) {
    throw new DocumentDriveFolderScopeError("document_drive_folder_scope_invalid");
  }
  return ids;
}

/**
 * Fail closed before importing anything when one authorized folder cannot be
 * fully enumerated, the combined result overflows, or an ID is repeated.
 * No financial originals or folder IDs are written into build artifacts.
 */
export async function discoverAuthorizedDocumentFolders(
  folderIds: readonly string[],
  listFolder: (folderId: string) => Promise<GoogleDriveDocumentDiscoveryResult>,
  listChildFolders?: (folderId: string) => Promise<string[]>,
): Promise<GoogleDriveDocumentDiscoveryResult> {
  if (folderIds.length < 1 || folderIds.length > MAX_AUTHORIZED_FOLDERS
    || folderIds.some((id) => !DRIVE_ID.test(id))
    || new Set(folderIds).size !== folderIds.length) {
    throw new DocumentDriveFolderScopeError("document_drive_folder_scope_invalid");
  }
  const files: DiscoveredDriveDocument[] = [];
  const seen = new Set<string>();
  // Breadth-first traversal; discovered children are still scoped to an exact
  // explicitly authorized parent. Never follow arbitrary Drive search results.
  const queue = folderIds.map((id) => ({ id, depth: 0 }));
  const queued = new Set(folderIds);
  let skippedUnsupported = 0;
  let skippedInvalid = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { id: folderId, depth } = queue[cursor];
    const result = await listFolder(folderId);
    if (!result || !Array.isArray(result.files)
      || !Number.isSafeInteger(result.skippedUnsupported) || result.skippedUnsupported < 0
      || !Number.isSafeInteger(result.skippedInvalid) || result.skippedInvalid !== 0
      || typeof result.truncated !== "boolean" || result.truncated
      || files.length + result.files.length > MAX_DISCOVERED_FILES) {
      throw new DocumentDriveFolderScopeError("document_drive_folder_inventory_incomplete");
    }
    for (const file of result.files) {
      if (!file || !DRIVE_ID.test(file.fileId) || seen.has(file.fileId)) {
        throw new DocumentDriveFolderScopeError("document_drive_folder_duplicate_or_invalid_file");
      }
      seen.add(file.fileId);
      files.push(file);
    }
    skippedUnsupported += result.skippedUnsupported;
    skippedInvalid += result.skippedInvalid;
    if (listChildFolders) {
      const children = await listChildFolders(folderId);
      if (!Array.isArray(children)
        || (children.length > 0 && depth >= MAX_FOLDER_DEPTH)) {
        throw new DocumentDriveFolderScopeError("document_drive_folder_tree_incomplete");
      }
      for (const child of children) {
        if (typeof child !== "string" || !DRIVE_ID.test(child) || queued.has(child)
          || queue.length >= MAX_TRAVERSED_FOLDERS) {
          throw new DocumentDriveFolderScopeError("document_drive_folder_tree_incomplete");
        }
        queued.add(child);
        queue.push({ id: child, depth: depth + 1 });
      }
    }
  }
  // Preserve the original file order within each folder. All discovery is
  // complete before the route starts verifying any candidate downloads.
  return { files, skippedUnsupported, skippedInvalid, truncated: false };
}
