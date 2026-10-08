// Real GoTrue users, memberships, Storage, SQL and unchanged gateway handlers.
// This deliberately does NOT emulate or certify the Vercel OIDC envelope.
import { createClient } from "supabase-js";
import postgres from "postgres";
import { isDeepStrictEqual } from "node:util";
import { handleDocumentLogicAction } from "../functions/financial-app-db-gateway/document-logic.ts";
import { handleBudgetLogicAction } from "../functions/financial-app-db-gateway/budget-logic.ts";
import { resolveWorkspaceContext, resetWorkspaceScope, WorkspaceContextError } from "../functions/financial-app-db-gateway/workspace-context.ts";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const dir = Deno.env.get("AUD_ISOLATED_DIR") ?? "";
assert(dir, "isolated_dir_required");
const url = Deno.env.get("SUPABASE_URL") ?? "";
const dbUrl = Deno.env.get("SUPABASE_DB_URL") ?? "";
for (const value of [url, dbUrl]) assert(new URL(value).hostname === "127.0.0.1", "cloud_runtime_forbidden");
const client = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const database = () => postgres(dbUrl, { max: 1, prepare: false, transform: { undefined: null } });
const workspaceA = "a0e20000-0000-4000-8000-000000000001";
const workspaceB = "a0e20000-0000-4000-8000-000000000002";
const categoryA = "a0e20000-0000-4000-8000-000000000003";
const categoryB = "a0e20000-0000-4000-8000-000000000004";

async function operation(token: string, action: string, payload: Record<string, unknown> = {}) {
  const sql = database(); // Every operation obtains a new connection: tests real re-read.
  try {
    const context = await resolveWorkspaceContext(new Request("http://127.0.0.1/isolated", {
      headers: { "x-financial-app-user-token": token },
    }), sql);
    const input = { action, payload, sql, environment: "production" };
    const response = await handleDocumentLogicAction(input) ?? await handleBudgetLogicAction(input);
    assert(response, "unsupported_test_action");
    return { status: response.status, body: await response.json(), context };
  } catch (error) {
    if (error instanceof WorkspaceContextError) return { status: error.status, body: { error: error.code }, context: null };
    throw error;
  } finally { await resetWorkspaceScope(sql); await sql.end(); }
}
async function ok(token: string, action: string, payload: Record<string, unknown> = {}) {
  const result = await operation(token, action, payload);
  assert(result.status === 200, `${action}_failed_${result.status}_${JSON.stringify(result.body)}`);
  return result.body;
}
async function user(label: string) {
  const email = `aud-${label}@example.test`, password = `AUD!${crypto.randomUUID()}a9`;
  const created = await client.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error && created.data.user, `create_${label}_failed`);
  const auth = createClient(url, Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await auth.auth.signInWithPassword({ email, password });
  assert(!signed.error && signed.data.session, `sign_in_${label}_failed`);
  return { id: created.data.user.id, email, password, token: signed.data.session.access_token };
}
const contextPath = `${dir}/context.json`;
if (Deno.args[0] === "prepare") {
  const owner = await user("owner"), member = await user("member"), foreign = await user("foreign"), denied = await user("denied");
  const sql = database();
  try {
    await sql`insert into financial_app.workspaces(id,name) values (${workspaceA}::uuid,'AUD authenticated A'),(${workspaceB}::uuid,'AUD authenticated B')`;
    for (const [account, workspace, role] of [[owner, workspaceA, "owner"], [member, workspaceA, "member"], [foreign, workspaceB, "owner"]] as const) {
      await sql`insert into financial_app.authorized_users(user_id,active) values (${account.id}::uuid,true)`;
      await sql`insert into financial_app.workspace_memberships(workspace_id,user_id,role,active,is_default) values (${workspace}::uuid,${account.id}::uuid,${role},true,true)`;
    }
    for (const [id, workspace] of [[categoryA, workspaceA], [categoryB, workspaceB]]) {
      await sql`select pg_catalog.set_config('financial_app.workspace_id',${workspace},false)`;
      await sql`insert into financial_app.categories(id,workspace_id,name,kind,icon_key,color_token) values (${id}::uuid,${workspace}::uuid,'AUD authenticated expense','expense','wallet','category.blue')`;
    }
  } finally { await sql.end(); }
  const upload = await ok(owner.token, "document.upload_sign", { type: "ticket", originalFileName: "AUD-synthetic-ticket.png", mimeType: "image/png", sizeBytes: 1000 });
  assert(new URL(upload.signedUrl).hostname === "127.0.0.1", "external_upload_forbidden");
  const registered = await ok(owner.token, "document.register", { type: "ticket", originalFileName: "AUD-synthetic-ticket.png", mimeType: "image/png", storageProvider: "supabase", storageKey: upload.path, sourceDriveFileId: null, sizeBytes: null, sourceModifiedAt: null });
  assert(registered.document?.id, "fixture_document_missing");
  await Deno.writeTextFile(contextPath, JSON.stringify({ owner, member, foreign, denied, upload, documentId: registered.document.id }), { mode: 0o600 });
  console.log("AUD_AUTH|stage=prepared|users=4|workspaces=2|real_auth=true");
} else if (Deno.args[0] === "verify") {
  const c = JSON.parse(await Deno.readTextFile(contextPath));
  // The app logout test revokes actual sessions. Authenticate afresh for this phase.
  for (const account of [c.owner, c.member, c.foreign]) {
    const auth = createClient(url, Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await auth.auth.signInWithPassword({ email: account.email, password: account.password });
    assert(!result.error && result.data.session, "fresh_session_failed");
    account.token = result.data.session.access_token;
  }
  const id = c.documentId;
  assert((await operation("", "document.detail", { id })).status === 403, "anonymous_accepted");
  assert((await operation("invalid-token", "document.detail", { id })).status === 401, "invalid_token_accepted");
  const finalized = await ok(c.owner.token, "document.upload_finalize", { type: "ticket", originalFileName: "AUD-synthetic-ticket.png", mimeType: "image/png", path: c.upload.path });
  assert(finalized.document.id === id && finalized.document.sizeBytes > 0, "real_storage_finalize_failed");
  await ok(c.owner.token, "document.update", { id, type: "ticket", documentDate: "2026-10-08", issuerName: "AUD synthetic issuer", totalCents: 1900, notes: "Synthetic isolated document, no personal data" });
  const original = (await ok(c.owner.token, "document.detail", { id })).document;
  assert(original.totalCents === 1900 && original.notes.includes("Synthetic"), "metadata_not_persisted");
  const designation = { id, isTest: true, ownerReviewed: true, reason: "Synthetic original reviewed in isolated acceptance" };
  assert((await operation(c.member.token, "document.test_designation", designation)).status === 403, "member_designation_accepted");
  const cross = await operation(c.foreign.token, "document.test_designation", designation);
  assert(cross.status === 404, "cross_workspace_designation_accepted");
  await ok(c.owner.token, "document.test_designation", designation);
  const designated = await ok(c.owner.token, "document.detail", { id });
  assert(designated.document.isTest === true && designated.document.testDesignationReason === designation.reason, "designation_not_persisted");
  assert((await ok(c.owner.token, "document.list", { scope: "ordinary" })).total === 0, "ordinary_queue_contains_test");
  assert((await ok(c.owner.token, "document.list", { scope: "tests" })).total === 1, "test_view_missing");
  assert((await ok(c.foreign.token, "document.list", { scope: "all" })).total === 0, "cross_workspace_read_leak");
  await ok(c.owner.token, "document.test_designation", { ...designation, isTest: false, reason: "Restore ordinary treatment" });
  assert((await ok(c.owner.token, "document.detail", { id })).document.isTest === false, "designation_not_reversible");
  const originalKeys = ["originalFileName", "storageProvider", "storageKey", "mimeType", "notes", "totalCents"];
  const restored = (await ok(c.owner.token, "document.detail", { id })).document;
  for (const key of originalKeys) assert(restored[key] === original[key], "original_metadata_changed_" + key);

  for (const amount of [1732, 0, null]) {
    await ok(c.owner.token, "budget.set_manual", { month: "2026-10", categoryId: categoryA, manualAmountCents: amount });
    const snapshot = await ok(c.owner.token, "budget.snapshot", { month: "2026-10" });
    assert(snapshot.categories.some((row: any) => row.categoryId === categoryA && row.manualAmountCents === amount), "budget_save_reload_failed_" + amount);
  }
  const crossBudget = await operation(c.foreign.token, "budget.set_manual", { month: "2026-10", categoryId: categoryA, manualAmountCents: 500 });
  assert(crossBudget.status === 404, "cross_workspace_budget_write_accepted");

  const evidence = JSON.parse(await Deno.readTextFile(`${dir}/ocr.json`));
  assert(evidence.rawResult.documentId === id && evidence.rawResult.plainText.includes("19,00"), "real_ocr_fixture_mismatch");
  const sql = database();
  try {
    // Postgres.js infers JSONB and serializes values itself. Pre-stringifying
    // produces a JSON string, the regression that rejected real OCR objects.
    const wire = await sql`select jsonb_typeof(${JSON.stringify(evidence.rawResult)}::jsonb) as legacy_type,
      jsonb_typeof(${sql.json(evidence.rawResult)}::jsonb) as object_type,
      jsonb_typeof(${sql.json([])}::jsonb) as array_type`;
    assert(wire[0].legacy_type === "string" && wire[0].object_type === "object"
      && wire[0].array_type === "array", "jsonb_wire_regression_not_reproduced");
    const before = await sql`select (select count(*) from financial_app.transactions)::int as transactions,(select count(*) from financial_app.transaction_source_records)::int as sources`;
    await ok(c.owner.token, "document.ocr_store", { documentId: id, rawResult: evidence.rawResult, interpretation: evidence.interpretation });
    const stored = await sql`select id,raw_result,interpretation from financial_app.document_ocr_runs where document_id=${id}::uuid`;
    assert(stored.length === 1 && isDeepStrictEqual(stored[0].raw_result, evidence.rawResult)
      && isDeepStrictEqual(stored[0].interpretation, evidence.interpretation), "ocr_result_not_persisted_exactly");
    const lineItems = [
      { description: "Producto sintético A", quantity: 1, unitPriceCents: 1230, totalCents: 1230 },
      { description: "Producto sintético B", quantity: 1, unitPriceCents: 420, totalCents: 420 },
      { description: "Producto sintético C", quantity: 1, unitPriceCents: 250, totalCents: 250 },
    ];
    const review = { documentId: id, ocrRunId: stored[0].id, type: "ticket", documentDate: "2026-10-08",
      documentTime: "12:34", issuerName: "AUD synthetic reviewed issuer", totalCents: 1900,
      lineItems, notes: "Reviewed synthetic original in isolated acceptance" };
    assert((await operation(c.foreign.token, "document.ocr_confirm", review)).status === 404, "cross_workspace_ocr_review_accepted");
    const confirmed = await ok(c.owner.token, "document.ocr_confirm", review);
    assert(confirmed.documentId === id && confirmed.ocrRunId === stored[0].id && confirmed.revision === 1,
      "ocr_review_contract_failed");
    const reloaded = (await ok(c.owner.token, "document.detail", { id })).document;
    assert(reloaded.status === "confirmed" && reloaded.documentTime === "12:34" && reloaded.totalCents === 1900
      && isDeepStrictEqual(reloaded.lineItems, lineItems), "ocr_review_save_reload_failed");
    // Empty arrays must also survive the JSONB wire contract.
    await ok(c.owner.token, "document.ocr_confirm", { ...review, lineItems: [] });
    const emptyReload = (await ok(c.owner.token, "document.detail", { id })).document;
    assert(Array.isArray(emptyReload.lineItems) && emptyReload.lineItems.length === 0, "empty_line_items_not_persisted");
    const immutable = await sql`select raw_result,interpretation from financial_app.document_ocr_runs where id=${stored[0].id}::uuid`;
    assert(isDeepStrictEqual(immutable[0].raw_result, evidence.rawResult)
      && isDeepStrictEqual(immutable[0].interpretation, evidence.interpretation), "ocr_review_mutated_raw_evidence");
    const after = await sql`select (select count(*) from financial_app.transactions)::int as transactions,(select count(*) from financial_app.transaction_source_records)::int as sources`;
    assert(JSON.stringify(before) === JSON.stringify(after), "ocr_wrote_financial_source");
    const history = await ok(c.owner.token, "document.ocr_history", { id });
    assert(JSON.stringify(history).includes("tesseract-js-7.0.0-spa"), "ocr_reload_missing");
    assert(history.runs.length === 1 && history.reviews.length === 2 && history.reviews[0].revision === 2,
      "ocr_review_history_missing");
  } finally { await sql.end(); }
  const opened = await ok(c.owner.token, "document.open", { id });
  assert(new URL(opened.url).hostname === "127.0.0.1", "cloud_document_open_forbidden");
  const bytes = new Uint8Array(await (await fetch(opened.url)).arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
  assert(hash === evidence.sourceSha256, "storage_original_changed");
  console.log("AUD_AUTH|stage=verified|owner_member=true|cross_workspace_denied=true|save_reload=true|ocr_real_persisted=true|human_review_persisted=true|jsonb_wire_regression=true|original_unchanged=true|oidc_envelope=not_tested");
} else { throw new Error("expected_prepare_or_verify"); }
