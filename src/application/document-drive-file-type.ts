/**
 * Classify a Drive document from its verified server-side filename.
 * JavaScript \b includes underscore and digits as word characters; ordinary
 * names such as "Factura_2026.pdf" therefore used to fall through as "other".
 * Match words delimited by non-letters, preserving protection against false
 * positives inside unrelated words (prefactura, facturacion, ticketera).
 */
export type DriveDocumentType = "invoice" | "ticket" | "other";

export function inferDocumentType(name: string): DriveDocumentType {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/(^|[^a-z])(factura|invoice)(?=$|[^a-z])/.test(normalized)) return "invoice";
  if (/(^|[^a-z])(ticket|tique|recibo)(?=$|[^a-z])/.test(normalized)) return "ticket";
  return "other";
}

/**
 * Registration metadata must use the same authoritative name supplied by
 * Drive's post-download verification, not an earlier folder-listing name.
 * A null verified name preserves the valid discovery fallback.
 */
export function classifyVerifiedDriveName(discoveredName: string, verifiedName: string | null) {
  const name = verifiedName ?? discoveredName;
  return { name, type: inferDocumentType(name) };
}
