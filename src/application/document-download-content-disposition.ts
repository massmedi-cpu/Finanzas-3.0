/**
 * File names from uploaded originals and Google Drive must never become raw
 * HTTP header bytes. Keep the ASCII filename fallback printable and put the
 * full Unicode name only in percent-encoded RFC 5987 filename*.
 */
export function documentDownloadContentDisposition(fileName: string): string {
  const sanitized = Array.from(fileName)
    // Replace unpaired UTF-16 surrogates but preserve valid emoji pairs.
    .map((character) => character.length === 1 && /[\uD800-\uDFFF]/.test(character) ? "_" : character)
    .join("")
    .replace(/[\u0000-\u001F\u007F-\u009F"\\/]/g, "_")
    .trim();
  const safeName = Array.from(sanitized).slice(0, 180).join("") || "documento";
  const fallback = safeName.normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/%/g, "_") || "documento";
  const encoded = encodeURIComponent(safeName)
    .replace(/[!'()*]/g, (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
