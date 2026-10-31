/**
 * One private original must keep the same server-authorized identity across
 * metadata, signed download and OCR. Caller-supplied IDs never override it.
 */
export type PrivateDocumentOriginalDetail = {
  document: {
    id: string;
    mimeType: string;
    originalFileName: string;
    storageProvider: "supabase" | "google_drive";
    sourceDriveFileId: string | null;
  };
};

export function isPrivateDocumentOriginalDetailForId(
  value: unknown,
  expectedId: string,
): value is PrivateDocumentOriginalDetail {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const document = (value as Record<string, unknown>).document;
  if (!document || typeof document !== "object" || Array.isArray(document)) return false;
  const row = document as Record<string, unknown>;
  return typeof expectedId === "string" && expectedId.length > 0
    && row.id === expectedId
    && typeof row.mimeType === "string" && row.mimeType.trim().length > 0
    && typeof row.originalFileName === "string" && row.originalFileName.trim().length > 0
    && (row.storageProvider === "supabase" || row.storageProvider === "google_drive")
    && (row.sourceDriveFileId === null || typeof row.sourceDriveFileId === "string");
}
