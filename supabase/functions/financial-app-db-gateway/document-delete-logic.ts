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


/* REC-DOC-DELETE-258: a deleted row has a workspace-scoped, immutable audit
 * receipt. Retry reads only its document ID; no client-supplied object key,
 * bucket or destination can authorize removal of a private original. */
async function cleanupFromDeleteReceipt(sql: any, id: string): Promise<Record<string, unknown>> {
  const ownerRows = await sql`select financial_app.require_current_workspace_id() as workspace_id`;
  const workspaceId = ownerRows[0]?.workspace_id;
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) {
    return { error: "document_delete_cleanup_unavailable", status: 503 };
  }
  const auditRows = await sql`
    select original_value->>'storageProvider' as provider,
           original_value->>'storageKey' as storage_key
      from financial_app.audit_changes
     where workspace_id=${workspaceId}::uuid
       and entity_type='document' and entity_id=${id}::uuid
       and field_name='deleted' and change_origin='user'
       and new_value='true'::jsonb
     order by changed_at desc, id desc limit 1
  `;
  if (!auditRows.length) return { error: "document_delete_cleanup_not_found", status: 404 };
  const receipt = auditRows[0];
  if (receipt.provider === "google_drive") {
    return { deleted: true, documentId: id, storageCleanupPending: false, sourceOriginalPreserved: true };
  }
  const path = receipt.storage_key;
  const scope = typeof path === "string" ? path.toLowerCase() : "";
  if (receipt.provider !== "supabase" || typeof path !== "string"
      || !STORAGE_PATH.test(path) || !scope.startsWith("uploads/" + workspaceId.toLowerCase() + "/")) {
    return { error: "document_delete_cleanup_unsafe_receipt", status: 409 };
  }

  // Reuse the lock held during upload finalization; do not delete an original
  // that has since been registered again within this workspace.
  return await sql.begin(async (tx: any) => {
    await tx`select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${workspaceId + ":" + path}, 0::bigint))`;
    const existing = await tx`
      select exists(
        select 1 from financial_app.documents
         where workspace_id=${workspaceId}::uuid
           and storage_provider='supabase' and storage_key=${path}
      ) as referenced
    `;
    if (existing[0]?.referenced !== false) {
      return { error: "document_delete_cleanup_referenced", status: 409 };
    }
    const filename = path.slice(path.lastIndexOf("/") + 1);
    const folder = path.slice(0, path.lastIndexOf("/"));
    try {
      const storage = storageClient().storage.from(BUCKET);
      const removed = await storage.remove([path]);
      const verified = await storage.list(folder, { limit: 100, search: filename });
      const candidates = verified.data;
      const provenAbsent = !verified.error && Array.isArray(candidates)
        && candidates.length < 100 && !candidates.some((item: any) => item?.name === filename);
      if (!provenAbsent) {
        if (removed.error) console.error("document-delete-cleanup-retry", removed.error.name ?? "unknown");
        return { deleted: true, documentId: id, storageCleanupPending: true, storageCleanupCode: "document_storage_cleanup_unverified" };
      }
      return { deleted: true, documentId: id, storageCleanupPending: false, sourceOriginalPreserved: false };
    } catch {
      return { deleted: true, documentId: id, storageCleanupPending: true, storageCleanupCode: "document_storage_cleanup_unavailable" };
    }
  });
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

    // The committed SQL audit is the durable recovery handle if Storage fails.
    // Any success declaration must follow a separate Storage readback.
    const cleaned = await cleanupFromDeleteReceipt(sql, id);
    if ("error" in cleaned) {
      return json({ ...deleted, storageCleanupPending: true, storageCleanupCode: cleaned.error });
    }
    return json({ ...deleted, ...cleaned });
  }

  if (action === "document.delete_cleanup") {
    const id = uuid(payload?.id);
    const cleaned = await cleanupFromDeleteReceipt(sql, id);
    if ("error" in cleaned) return json({ error: cleaned.error }, Number(cleaned.status) || 409);
    return json(cleaned);
  }

  }

  return null;
}
