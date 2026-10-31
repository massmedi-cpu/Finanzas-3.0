/**
 * Immutable identity check for retries of a verified private Storage object.
 * A repeated finalize may reuse the same registered original; it may NEVER
 * rewrite a document's filename, classification, MIME or byte count.
 * The SHA-256 assertion is independently verified against private Storage.
 */
export type PrivateDocumentReplayIdentity = {
  type: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number | null;
};

export function matchesPrivateDocumentReplay(
  registered: PrivateDocumentReplayIdentity,
  verified: PrivateDocumentReplayIdentity,
): boolean {
  return registered.type === verified.type
    && registered.originalFileName === verified.originalFileName
    && registered.mimeType === verified.mimeType
    && registered.sizeBytes === verified.sizeBytes
    && verified.sizeBytes !== null
    && Number.isSafeInteger(verified.sizeBytes)
    && verified.sizeBytes > 0;
}
