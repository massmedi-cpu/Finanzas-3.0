import { NextRequest } from "next/server";
import { getAuthorizedClient } from "@/lib/auth/authorized-client";
import { apiError, apiFailure, apiJson, apiUnauthorized } from "@/lib/api/response";
import { asNumber, asRecord, asString } from "@/lib/validation/json";

export const dynamic = "force-dynamic";

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function GET(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();

  const search = request.nextUrl.searchParams.get("search");
  const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 200, 1, 200);
  const offset = boundedInteger(request.nextUrl.searchParams.get("offset"), 0, 0, 1_000_000);
  const includeArchived = request.nextUrl.searchParams.get("archived") !== "0";
  const { data, error } = await supabase.rpc("financial_app_archive_overview", {
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
    p_include_archived: includeArchived,
  });

  if (error || !data) return apiFailure("archive.overview", error, "archive_unavailable");
  const payload = asRecord(data);
  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  return apiJson({ ...payload, ok: true, hasMore: documents.length >= limit });
}

export async function POST(request: NextRequest) {
  const supabase = await getAuthorizedClient();
  if (!supabase) return apiUnauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }

  const input = asRecord(body);
  const fileName = asString(input.fileName);
  const mimeType = asString(input.mimeType);
  const storagePath = asString(input.storagePath);
  const fileSize = asNumber(input.fileSize);
  const contentHash = asString(input.contentHash).trim().toLowerCase();

  if (contentHash) {
    const existing = await supabase.rpc("financial_app_archive_find_by_hash", {
      p_content_hash: contentHash,
    });
    if (existing.error) return apiFailure("archive.duplicate.lookup", existing.error, "archive_create_failed");

    if (existing.data) {
      const id = String(existing.data);
      const current = await supabase.rpc("financial_app_archive_document", { p_id: id });
      if (current.error || !current.data) {
        if (storagePath) await supabase.storage.from("financial-app-documents").remove([storagePath]);
        return apiFailure("archive.duplicate.read", current.error, "archive_create_failed");
      }

      const reused = await supabase.rpc("financial_app_archive_reuse_duplicate", {
        p_id: id,
        p_content_hash: contentHash,
        p_file_name: fileName,
        p_mime_type: mimeType,
        p_storage_path: storagePath,
        p_file_size: fileSize,
      });
      if (reused.error || !reused.data) {
        if (storagePath) await supabase.storage.from("financial-app-documents").remove([storagePath]);
        return apiFailure("archive.duplicate.reuse", reused.error, "archive_create_failed");
      }

      const previousStoragePath =
        current.data.storageProvider === "supabase_storage" && current.data.storagePath
          ? String(current.data.storagePath)
          : null;
      let storageCleanupPending = false;
      if (previousStoragePath && previousStoragePath !== storagePath) {
        const removed = await supabase.storage.from("financial-app-documents").remove([previousStoragePath]);
        storageCleanupPending = Boolean(removed.error);
      }

      return apiJson({ ok: true, id, duplicate: true, storageCleanupPending });
    }
  }

  const { data, error } = await supabase.rpc("financial_app_archive_create", {
    p_file_name: fileName,
    p_mime_type: mimeType,
    p_storage_path: storagePath,
    p_file_size: fileSize,
    p_content_hash: contentHash,
  });
  if (error || !data) return apiFailure("archive.create", error, "archive_create_failed");
  return apiJson({ ok: true, id: data, duplicate: false });
}
