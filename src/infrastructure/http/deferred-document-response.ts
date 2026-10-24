import { isDocumentsDeferred } from "../../application/release-document-scope";

/** Called before parsing input or contacting Storage, Drive or persistence. */
export function deferredDocumentResponse(): Response | null {
  if (!isDocumentsDeferred()) return null;
  return Response.json({ error: "feature_deferred", code: null }, {
    status: 404,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
