/**
 * Deterministic private object identifier for NEW uploads only.
 *
 * Exactly identical file bytes have the same SHA-256. Restricting the storage
 * key to its first 122 UUID bits preserves the signed-URL validation contract
 * and makes two independent devices target ONE private path per workspace.
 *
 * The gateway MUST verify the FULL 256-bit SHA against the downloaded object
 * before registration; the shortened UUID is not proof of file equality.
 */
export function privateDocumentContentId(sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("invalid_document_content_sha256");
  }
  const bytes = sha256.slice(0, 32).match(/.{2}/g)!;
  bytes[6] = ((parseInt(bytes[6], 16) & 0x0f) | 0x50).toString(16).padStart(2, "0");
  bytes[8] = ((parseInt(bytes[8], 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  const hex = bytes.join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20, 32)].join("-");
}

/**
 * The first clients used random v4 UUIDs for private uploads. Modern clients
 * use a deterministic v5-shaped UUID obtained from the full SHA-256 digest.
 * v5-shaped paths MUST agree with the supplied digest before we read or
 * register private Storage bytes; otherwise a caller could store digest B
 * at the deterministic path reserved for digest A and defeat deduplication.
 *
 * This does not prove that Storage contains the claimed bytes: the gateway
 * must still calculate the FULL SHA-256 of the downloaded private object.
 */
export function matchesPrivateDocumentUploadPathContract(
  path: string,
  expectedSha256: string | null,
): boolean {
  const match = path.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(?:pdf|jpg|png|webp)$/i);
  if (!match) return false;
  const objectId = match[1].toLowerCase();
  const version = objectId[14];
  if (version === "4") return true; // Backwards-compatible random object key.
  if (version !== "5" || expectedSha256 === null || !/^[0-9a-f]{64}$/.test(expectedSha256)) return false;
  return privateDocumentContentId(expectedSha256) === objectId;
}
