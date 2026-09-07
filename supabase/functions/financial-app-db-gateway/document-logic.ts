import { createClient } from "supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STORAGE_PATH = /^uploads\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i;
const DOCUMENT_TYPES = new Set(["ticket", "invoice", "other"]);
const DOCUMENT_STATUSES = new Set(["imported", "pending_review", "confirmed", "archived"]);
const DOCUMENT_METHODS = new Set(["manual", "suggested"]);
const MIME_EXTENSIONS = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const BUCKET = "financial-app-documents";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

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

function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`invalid_${field}`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`invalid_${field}`);
  return result;
}

function text(value: unknown, field: string, max: number): string {
  const result = nullableText(value, field, max);
  if (!result) throw new Error(`invalid_${field}`);
  return result;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`invalid_${field}`);
  return value;
}

function nullableDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(`invalid_${field}`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function safeInteger(value: unknown, field: string, nullable = false): number | null {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`invalid_${field}`);
  return value;
}

function boundedInteger(value: unknown, field: string, min: number, max: number, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const result = safeInteger(value, field) as number;
  if (result < min || result > max) throw new Error(`invalid_${field}`);
  return result;
}

function documentType(value: unknown): string {
  if (typeof value !== "string" || !DOCUMENT_TYPES.has(value)) throw new Error("invalid_document_type");
  return value;
}

function documentStatus(value: unknown, nullable = false): string | null {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !DOCUMENT_STATUSES.has(value)) throw new Error("invalid_document_status");
  return value;
}

function documentMethod(value: unknown): string {
  if (typeof value !== "string" || !DOCUMENT_METHODS.has(value)) throw new Error("invalid_document_association_method");
  return value;
}

function mimeType(value: unknown): string {
  const result = text(value, "document_mime_type", 200).toLowerCase();
  if (!MIME_EXTENSIONS.has(result)) throw new Error("unsupported_document_mime_type");
  return result;
}

function storageClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("document_storage_unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("document_not_found") || message.includes("document_transaction_not_found") || message.includes("document_association_not_found")) {
    return json({ error: message.match(/document_[a-z_]+/)?.[0] ?? "document_not_found" }, 404);
  }
  if (message.includes("document_suggestion_not_current") || message.includes("document_suggestion_metadata_required")) {
    return json({ error: message.match(/document_[a-z_]+/)?.[0] ?? "document_conflict" }, 409);
  }
  if (message.includes("invalid_document_") || message.includes("unsupported_document_")) {
    return json({ error: message.match(/(invalid|unsupported)_document_[a-z_]+/)?.[0] ?? "invalid_document_request" }, 400);
  }
  console.error("document-logic-database", error instanceof Error ? error.name : typeof error);
  return json({ error: "document_internal_error" }, 500);
}

async function documentQuery(run: () => Promise<any>) {
  try {
    const rows = await run();
    return json(rows[0]?.result ?? null);
  } catch (error) {
    return databaseError(error);
  }
}

export async function handleDocumentLogicAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "document.list") {
    const status = documentStatus(payload.status, true);
    const query = nullableText(payload.query, "document_query", 200);
    const limit = boundedInteger(payload.limit, "document_limit", 1, 100, 50);
    const offset = boundedInteger(payload.offset, "document_offset", 0, 100000, 0);
    return documentQuery(() => sql`
      select financial_app.document_list(${status},${query},${limit}::integer,${offset}::integer) as result
    `);
  }

  if (action === "document.detail") {
    const id = uuid(payload.id, "document_id");
    return documentQuery(() => sql`select financial_app.document_detail(${id}::uuid) as result`);
  }

  if (action === "document.register") {
    const type = documentType(payload.type);
    const originalFileName = text(payload.originalFileName, "document_file_name", 500);
    const mime = text(payload.mimeType, "document_mime_type", 200);
    const provider = text(payload.storageProvider, "document_storage_provider", 32);
    if (provider !== "supabase" && provider !== "google_drive") throw new Error("invalid_document_storage_provider");
    const storageKey = text(payload.storageKey, "document_storage_key", 1000);
    const driveFileId = nullableText(payload.sourceDriveFileId, "document_drive_file_id", 300);
    const sizeBytes = safeInteger(payload.sizeBytes, "document_size", true);
    if (sizeBytes !== null && sizeBytes < 0) throw new Error("invalid_document_size");
    const sourceModifiedAt = nullableText(payload.sourceModifiedAt, "document_source_modified_at", 80);
    return documentQuery(() => sql`
      select financial_app.register_document(
        ${type},${originalFileName},${mime},${provider},${storageKey},${driveFileId},
        ${sizeBytes}::bigint,${sourceModifiedAt}::timestamptz
      ) as result
    `);
  }

  if (action === "document.update") {
    const id = uuid(payload.id, "document_id");
    const type = documentType(payload.type);
    const date = nullableDate(payload.documentDate, "document_date");
    const issuer = nullableText(payload.issuerName, "document_issuer", 300);
    const totalCents = safeInteger(payload.totalCents, "document_total", true);
    const notes = payload.notes === undefined || payload.notes === null ? "" : String(payload.notes);
    if (notes.length > 2000) throw new Error("invalid_document_notes");
    return documentQuery(() => sql`
      select financial_app.update_document_metadata(
        ${id}::uuid,${type},${date}::date,${issuer},${totalCents}::bigint,${notes}
      ) as result
    `);
  }

  if (action === "document.status") {
    const id = uuid(payload.id, "document_id");
    const status = documentStatus(payload.status) as string;
    return documentQuery(() => sql`select financial_app.set_document_status(${id}::uuid,${status}) as result`);
  }

  if (action === "document.candidates") {
    const id = uuid(payload.id, "document_id");
    const days = boundedInteger(payload.days, "document_candidate_days", 0, 31, 7);
    const limit = boundedInteger(payload.limit, "document_candidate_limit", 1, 20, 8);
    return documentQuery(() => sql`
      select financial_app.document_transaction_candidates(${id}::uuid,${days}::integer,${limit}::integer) as result
    `);
  }

  if (action === "document.associate") {
    const documentId = uuid(payload.documentId, "document_id");
    const transactionId = uuid(payload.transactionId, "document_transaction_id");
    const method = documentMethod(payload.method);
    return documentQuery(() => sql`
      select financial_app.confirm_document_transaction(${documentId}::uuid,${transactionId}::uuid,${method}) as result
    `);
  }

  if (action === "document.unassociate") {
    const documentId = uuid(payload.documentId, "document_id");
    const transactionId = uuid(payload.transactionId, "document_transaction_id");
    return documentQuery(() => sql`
      select financial_app.remove_document_transaction(${documentId}::uuid,${transactionId}::uuid) as result
    `);
  }

  if (action === "document.upload_sign") {
    documentType(payload.type);
    const originalFileName = text(payload.originalFileName, "document_file_name", 500);
    const mime = mimeType(payload.mimeType);
    const sizeBytes = safeInteger(payload.sizeBytes, "document_size") as number;
    if (sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) throw new Error("invalid_document_size");
    const extension = MIME_EXTENSIONS.get(mime)!;
    const path = `uploads/${crypto.randomUUID()}.${extension}`;
    const supabase = storageClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.signedUrl || !data?.token) {
      console.error("document-storage-sign", error?.name ?? "unknown");
      return json({ error: "document_upload_sign_failed" }, 503);
    }
    return json({
      bucket: BUCKET,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      originalFileName,
      mimeType: mime,
      sizeBytes,
      maxFileBytes: MAX_FILE_BYTES,
    });
  }

  if (action === "document.upload_finalize") {
    const type = documentType(payload.type);
    const originalFileName = text(payload.originalFileName, "document_file_name", 500);
    const mime = mimeType(payload.mimeType);
    const path = text(payload.path, "document_storage_key", 1000);
    if (!STORAGE_PATH.test(path)) throw new Error("invalid_document_storage_key");
    const rows = await sql`
      select metadata,updated_at
      from storage.objects
      where bucket_id=${BUCKET} and name=${path}
      limit 1
    `;
    if (!rows[0]) return json({ error: "document_upload_not_found" }, 404);
    const metadata = rows[0]?.metadata ?? {};
    const storedSize = typeof metadata?.size === "number" ? metadata.size : null;
    const storedMime = typeof metadata?.mimetype === "string" ? metadata.mimetype : null;
    if (storedMime && storedMime !== mime) return json({ error: "document_upload_mime_mismatch" }, 409);
    return documentQuery(() => sql`
      select financial_app.register_document(
        ${type},${originalFileName},${mime},'supabase',${path},null,
        ${storedSize}::bigint,${rows[0]?.updated_at}::timestamptz
      ) as result
    `);
  }

  if (action === "document.open") {
    const id = uuid(payload.id, "document_id");
    try {
      const rows = await sql`
        select storage_provider,storage_key,source_drive_file_id
        from financial_app.documents where id=${id}::uuid
      `;
      const row = rows[0];
      if (!row) return json({ error: "document_not_found" }, 404);
      if (row.storage_provider === "google_drive") {
        if (!row.source_drive_file_id) return json({ error: "document_drive_file_unavailable" }, 409);
        return json({ provider: "google_drive", url: `https://drive.google.com/open?id=${encodeURIComponent(row.source_drive_file_id)}` });
      }
      const supabase = storageClient();
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_key, 300);
      if (error || !data?.signedUrl) return json({ error: "document_open_failed" }, 503);
      return json({ provider: "supabase", url: data.signedUrl, expiresInSeconds: 300 });
    } catch (error) {
      return databaseError(error);
    }
  }

  if (action === "document.drive_batch") {
    if (!Array.isArray(payload.files) || payload.files.length < 1 || payload.files.length > 200) {
      throw new Error("invalid_document_drive_batch");
    }
    let imported = 0;
    for (const raw of payload.files) {
      const type = documentType(raw?.type ?? "other");
      const name = text(raw?.name, "document_file_name", 500);
      const mime = mimeType(raw?.mimeType);
      const fileId = text(raw?.fileId, "document_drive_file_id", 300);
      const size = safeInteger(raw?.sizeBytes, "document_size", true);
      const modifiedTime = nullableText(raw?.modifiedTime, "document_source_modified_at", 80);
      await sql`
        select financial_app.register_document(
          ${type},${name},${mime},'google_drive',${fileId},${fileId},${size}::bigint,${modifiedTime}::timestamptz
        )
      `;
      imported += 1;
    }
    return json({ imported, total: payload.files.length, ocrUsed: false });
  }

  if (action === "test.document_engine") {
    if (environment !== "preview") return json({ error: "test_document_engine_preview_only" }, 403);

    let documentId: string | null = null;
    let transactionId: string | null = null;
    let verified = false;

    try {
      await sql.begin(async (tx: any) => {
        const actualRows = await tx`
          select f.transaction_id,f.bank_date,f.amount_cents
          from financial_app.financial_transaction_facts() f
          where f.analytics_eligible=true and f.effective_kind='expense' and f.amount_cents<0
          order by f.bank_date desc,f.transaction_id
          limit 1
        `;
        const actual = actualRows[0];
        transactionId = actual?.transaction_id ?? null;
        if (!transactionId) throw new Error("test_document_transaction_unavailable");

        const registeredRows = await tx`
          select financial_app.register_document(
            'invoice','PHASE9 PREVIEW ROLLBACK.pdf','application/pdf','supabase',
            ${`__phase9_preview_${crypto.randomUUID()}__`},null,1234,now()
          ) as result
        `;
        documentId = registeredRows[0]?.result?.document?.id ?? null;
        if (!documentId) throw new Error("test_document_register_failed");

        const updatedRows = await tx`
          select financial_app.update_document_metadata(
            ${documentId}::uuid,'invoice',${actual.bank_date}::date,'PHASE9 PREVIEW',
            ${Math.abs(Number(actual.amount_cents))}::bigint,'rollback-only'
          ) as result
        `;
        const candidateRows = await tx`
          select financial_app.document_transaction_candidates(${documentId}::uuid,7,8) as result
        `;
        const candidate = candidateRows[0]?.result?.candidates?.find((row: any) => row.transactionId === transactionId);
        if (!candidate) throw new Error("test_document_candidate_failed");

        const associatedRows = await tx`
          select financial_app.confirm_document_transaction(${documentId}::uuid,${transactionId}::uuid,'suggested') as result
        `;
        const removedRows = await tx`
          select financial_app.remove_document_transaction(${documentId}::uuid,${transactionId}::uuid) as result
        `;
        const statusRows = await tx`
          select financial_app.set_document_status(${documentId}::uuid,'confirmed') as result
        `;
        const listRows = await tx`select financial_app.document_list('confirmed','PHASE9 PREVIEW',20,0) as result`;
        const auditRows = await tx`
          select count(*)::int as count from financial_app.audit_changes
          where entity_type='document' and entity_id=${documentId}::uuid
        `;

        verified =
          updatedRows[0]?.result?.document?.status === 'pending_review' &&
          candidateRows[0]?.result?.principles?.bankSource === 'read_only' &&
          candidateRows[0]?.result?.principles?.suggestionsPersisted === false &&
          candidate.transactionId === transactionId &&
          associatedRows[0]?.result?.associations?.length === 1 &&
          removedRows[0]?.result?.associations?.length === 0 &&
          statusRows[0]?.result?.document?.status === 'confirmed' &&
          listRows[0]?.result?.total >= 1 &&
          auditRows[0]?.count >= 6;
        if (!verified) throw new Error("test_document_engine_failed");
        throw new Error("__ROLLBACK_DOCUMENT_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_DOCUMENT_TEST__") throw error;
    }

    const testPath = `uploads/${crypto.randomUUID()}.png`;
    const supabase = storageClient();
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
    const upload = await supabase.storage.from(BUCKET).upload(testPath, png, { contentType: "image/png", upsert: false });
    if (upload.error) throw new Error("test_document_storage_upload_failed");
    const signed = await supabase.storage.from(BUCKET).createSignedUrl(testPath, 60);
    const storageVerified = !signed.error && Boolean(signed.data?.signedUrl);
    const removed = await supabase.storage.from(BUCKET).remove([testPath]);
    if (removed.error) throw new Error("test_document_storage_cleanup_failed");

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.documents where id=${documentId}::uuid) as documents,
        (select count(*)::int from financial_app.document_transaction_associations where document_id=${documentId}::uuid) as associations,
        (select count(*)::int from financial_app.audit_changes where entity_type='document' and entity_id=${documentId}::uuid) as audit_changes,
        (select count(*)::int from storage.objects where bucket_id=${BUCKET} and name=${testPath}) as storage_objects
    `;
    const residue = residueRows[0] ?? {};
    const clean = ["documents", "associations", "audit_changes", "storage_objects"].every((key) => residue[key] === 0);

    return json({ verified, clean, storageVerified, residue, ocrUsed: false, suggestionsPersisted: false, bankSource: "read_only" });
  }

  return null;
}
