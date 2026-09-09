export const SUPPORTED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedDocumentMimeType = (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number];

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // %PDF-
const JPEG = [0xff, 0xd8, 0xff] as const;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  if (bytes.byteLength < offset + signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature[index]) return false;
  }
  return true;
}

export function isSupportedDocumentMimeType(value: string): value is SupportedDocumentMimeType {
  return (SUPPORTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(value);
}

export function documentBytesMatchMimeType(bytes: Uint8Array, mimeType: string) {
  const mime = mimeType.trim().toLowerCase();
  if (!bytes.byteLength || !isSupportedDocumentMimeType(mime)) return false;
  if (mime === "application/pdf") return startsWith(bytes, PDF);
  if (mime === "image/jpeg") return startsWith(bytes, JPEG);
  if (mime === "image/png") return startsWith(bytes, PNG);
  return startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8);
}
