import { createClient } from "supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = "financial-app-documents";
const STORAGE_PATH = /^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("invalid_document_id");
  return value;
}

function storageClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("document_storage_unavailable");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function unwrapResult(rows: any[]) {
  const result = rows?.[0]?.result;
  if (!result || typeof result !== "object") throw new Error("document_delete_contract_invalid");
  return result as Record<string, unknown>;
}

export async function handleDocumentDeleteAction({
  action,
  payload,
  sql,
}: {
  action: unknown;
  payload: any;
  sql: any;
  environment: string;
}) {
  if (action === "document.delete_preflight") {
    const id = uuid(payload?.id);
    const rows = await sql`select financial_app.document_delete_preflight(${id}::uuid) as result`;
    return json(unwrapResult(rows));
  }

  if (action === "document.delete") {
    const id = uuid(payload?.id);
    const preflightRows = await sql`select financial_app.document_delete_preflight(${id}::uuid) as result`;
    const preflight = unwrapResult(preflightRows);
    if (preflight.canDelete !== true) {
      return json({
        error: "document_delete_forbidden",
        code: typeof preflight.reason === "string" ? preflight.reason : "document_delete_forbidden",
        preflight,
      }, 409);
    }

    const deletedRows = await sql`select financial_app.delete_document_registration(${id}::uuid) as result`;
    const deleted = unwrapResult(deletedRows);
    const storageProvider = deleted.storageProvider;
    const storageKey = typeof deleted.storageKey === "string" ? deleted.storageKey : null;

    if (storageProvider === "supabase" && storageKey) {
      if (!STORAGE_PATH.test(storageKey)) {
        console.error("document-delete-storage-key-invalid", id);
        return json({ ...deleted, storageCleanupPending: true, storageCleanupCode: "document_storage_key_invalid" });
      }
      const supabase = storageClient();
      const { error } = await supabase.storage.from(BUCKET).remove([storageKey]);
      if (error) {
        console.error("document-delete-storage-cleanup", error.name ?? "unknown");
        return json({ ...deleted, storageCleanupPending: true, storageCleanupCode: "document_storage_cleanup_failed" });
      }
    }

    return json({
      ...deleted,
      storageCleanupPending: false,
      sourceOriginalPreserved: storageProvider === "google_drive",
    });
  }

  return null;
}
