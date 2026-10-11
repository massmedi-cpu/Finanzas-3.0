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
