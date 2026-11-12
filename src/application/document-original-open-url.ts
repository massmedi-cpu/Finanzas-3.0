import { SUPABASE_ORIGIN } from "../infrastructure/auth/supabase-auth";

type OriginalDocumentSource = {
  storageProvider: "supabase" | "google_drive";
  sourceDriveFileId: string | null;
};

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const PRIVATE_ORIGINAL_PATH =
  /^\/storage\/v1\/object\/sign\/financial-app-documents\/uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:pdf|jpe?g|png|webp)$/i;

function unsafe(): never {
  // Do not echo the untrusted backend URL or its signed token in UI or logs.
  throw new Error("document_open_unsafe_url");
}

/**
 * Accept only the exact two origins and URL shapes produced by the authorized
 * document.open gateway. A mere https:// scheme is not sufficient: a malformed
 * gateway response must never navigate the owner to an arbitrary host.
 */
export function verifiedDocumentOriginalOpenUrl(
  response: unknown,
  source: OriginalDocumentSource,
  signedStorageOrigin: string = SUPABASE_ORIGIN,
): string {
  if (!response || typeof response !== "object" || Array.isArray(response)
    || !source || typeof source !== "object") return unsafe();

  const result = response as Record<string, unknown>;
  if (result.provider !== source.storageProvider
    || typeof result.url !== "string" || !result.url.trim()) return unsafe();

  let url: URL;
  try { url = new URL(result.url); }
  catch { return unsafe(); }

  if (url.protocol !== "https:" || url.port !== "" || url.username !== ""
    || url.password !== "" || url.hash !== "") return unsafe();

  if (source.storageProvider === "google_drive") {
    if (!source.sourceDriveFileId || !DRIVE_ID.test(source.sourceDriveFileId)
      || url.origin !== "https://drive.google.com" || url.pathname !== "/open"
      || [...url.searchParams.keys()].join(",") !== "id"
      || url.searchParams.get("id") !== source.sourceDriveFileId) return unsafe();
    return url.href;
  }

  if (url.origin !== signedStorageOrigin || !PRIVATE_ORIGINAL_PATH.test(url.pathname)
    || [...url.searchParams.keys()].join(",") !== "token"
    || !url.searchParams.get("token")) return unsafe();
  return url.href;
}
