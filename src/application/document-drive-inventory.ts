/**
 * Safe read-only inventory used before incremental Drive imports.
 * A gateway response that truncates a page must not be treated as evidence
 * that missing originals are new. Never mutate storage or bank data here.
 */
export type DocumentDriveInventoryRow = {
  sourceDriveFileId: string | null;
  sourceModifiedAt: string | null;
  mimeType: string;
  sizeBytes: number | null;
};

export type DocumentDriveInventoryPage = {
  items: DocumentDriveInventoryRow[];
  total: number;
};

export class DocumentDriveInventoryError extends Error {
  constructor() {
    super("document_drive_inventory_incomplete");
    this.name = "DocumentDriveInventoryError";
  }
}

export async function loadDocumentDriveInventory(
  readPage: (offset: number, limit: number) => Promise<DocumentDriveInventoryPage>,
  pageSize = 100,
): Promise<Map<string, DocumentDriveInventoryRow>> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new DocumentDriveInventoryError();
  }
  const itemsByDriveId = new Map<string, DocumentDriveInventoryRow>();
  let offset = 0;
  let expectedTotal: number | null = null;
  do {
    const page = await readPage(offset, pageSize);
    if (!page || !Array.isArray(page.items)
      || !Number.isSafeInteger(page.total) || page.total < 0
      || page.items.length > pageSize
      || (expectedTotal !== null && page.total !== expectedTotal)
      || page.items.length > page.total - offset) {
      throw new DocumentDriveInventoryError();
    }
    if (expectedTotal === null) expectedTotal = page.total;
    if (page.items.length === 0 && offset < expectedTotal) {
      throw new DocumentDriveInventoryError();
    }
    for (const item of page.items) {
      if (!item || (item.sourceDriveFileId !== null
        && (typeof item.sourceDriveFileId !== "string" || !item.sourceDriveFileId.trim()))
        || typeof item.mimeType !== "string" || !item.mimeType.trim()
        || (item.sizeBytes !== null && (!Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 0))
        || (item.sourceModifiedAt !== null && typeof item.sourceModifiedAt !== "string")) {
        throw new DocumentDriveInventoryError();
      }
      if (item.sourceDriveFileId) {
        if (itemsByDriveId.has(item.sourceDriveFileId)) {
          throw new DocumentDriveInventoryError();
        }
        itemsByDriveId.set(item.sourceDriveFileId, item);
      }
    }
    offset += page.items.length;
  } while (offset < (expectedTotal ?? 0));
  return itemsByDriveId;
}
