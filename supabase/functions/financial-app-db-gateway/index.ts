import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { gunzipSync } from "node:zlib";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import postgres from "postgres";
import { handleCategorizationRuleAction } from "./categorization-rules.ts";
import { handleGoogleOauthAction } from "./google-oauth.ts";
import { handleMerchantAliasAction } from "./merchant-alias.ts";
import { handleSourceSyncAction } from "./source-sync-router.ts";

const TEAM_SLUG = "massmedi-9832s-projects";
const TEAM_ID = "team_xrSskbkRKwQkyYc0vvLVGUnb";
const PROJECT_NAME = "finanzas-3-0";
const PROJECT_ID = "prj_SbZ64E02YhCK4ds24Yi7qf5CeQjo";
const AUDIENCE = `https://vercel.com/${TEAM_SLUG}`;
const ALLOWED_ISSUERS = new Set(["https://oidc.vercel.com", `https://oidc.vercel.com/${TEAM_SLUG}`]);
const ALLOWED_ENVIRONMENTS = new Set(["preview", "production"]);
const JWKS = createRemoteJWKSet(new URL("https://oidc.vercel.com/.well-known/jwks"));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_TYPES = new Set(["checking", "savings", "credit", "cash", "investment", "other"]);
const CATEGORY_KINDS = new Set(["income", "expense", "transfer"]);
const LIFECYCLES = new Set(["active", "archived"]);
const TEST_ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
const TEST_CATEGORY_IDS = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
] as const;
const MAX_COMPRESSED_GATEWAY_BODY_BYTES = 2 * 1024 * 1024;
const MAX_DECOMPRESSED_GATEWAY_BODY_BYTES = 16 * 1024 * 1024;

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

function parseGatewayJsonBody(bytes: Uint8Array) {
  if (bytes.byteLength === 0) return {};
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function readGatewayJsonBody(req: Request) {
  const contentEncoding = (req.headers.get("content-encoding") ?? "").trim().toLowerCase();
  const bodyBytes = new Uint8Array(await req.arrayBuffer());

  if (!contentEncoding || contentEncoding === "identity") {
    if (bodyBytes.byteLength > MAX_DECOMPRESSED_GATEWAY_BODY_BYTES) {
      throw new Error("gateway_body_too_large");
    }
    return parseGatewayJsonBody(bodyBytes);
  }

  if (contentEncoding !== "gzip") {
    throw new Error("unsupported_content_encoding");
  }
  if (bodyBytes.byteLength > MAX_COMPRESSED_GATEWAY_BODY_BYTES) {
    throw new Error("gateway_compressed_body_too_large");
  }

  const decompressed = gunzipSync(bodyBytes);
  if (decompressed.byteLength > MAX_DECOMPRESSED_GATEWAY_BODY_BYTES) {
    throw new Error("gateway_body_too_large");
  }
  return parseGatewayJsonBody(Uint8Array.from(decompressed));
}

function uuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`invalid_${field}`);
}
function text(value: unknown, field: string, allowEmpty = false): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`invalid_${field}`);
}
function safeInteger(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`invalid_${field}`);
}
function nonNegativeInteger(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`invalid_${field}`);
}
function accountPayload(account: any) {
  uuid(account?.id, "account_id");
  text(account?.name, "account_name");
  if (account.institution !== null) text(account.institution, "institution", true);
  if (!ACCOUNT_TYPES.has(account?.type)) throw new Error("invalid_account_type");
  safeInteger(account?.openingBalanceCents, "opening_balance");
  if (account?.currency !== "EUR") throw new Error("invalid_currency");
  if (!LIFECYCLES.has(account?.lifecycle)) throw new Error("invalid_lifecycle");
  nonNegativeInteger(account?.sortOrder, "sort_order");
  text(account?.createdAt, "created_at");
  text(account?.updatedAt, "updated_at");
}
function categoryPayload(category: any) {
  uuid(category?.id, "category_id");
  text(category?.name, "category_name");
  if (!CATEGORY_KINDS.has(category?.kind)) throw new Error("invalid_category_kind");
  if (category.parentCategoryId !== null) uuid(category.parentCategoryId, "parent_category_id");
  text(category?.iconKey, "icon_key");
  text(category?.colorToken, "color_token");
  if (!LIFECYCLES.has(category?.lifecycle)) throw new Error("invalid_lifecycle");
  nonNegativeInteger(category?.sortOrder, "sort_order");
  text(category?.createdAt, "created_at");
  text(category?.updatedAt, "updated_at");
}
function orderedIds(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !UUID.test(id))) {
    throw new Error("invalid_ordered_ids");
  }
  if (new Set(value).size !== value.length) throw new Error("duplicate_ordered_ids");
}
async function verifyVercel(req: Request) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) throw new Error("missing_token");
  const unverified = decodeJwt(token);
  const issuer = typeof unverified.iss === "string" ? unverified.iss : "";
  if (!ALLOWED_ISSUERS.has(issuer)) throw new Error("invalid_issuer");
  const { payload } = await jwtVerify(token, JWKS, { issuer, audience: AUDIENCE });
  if (payload.owner_id !== TEAM_ID || payload.project_id !== PROJECT_ID || payload.project !== PROJECT_NAME) {
    throw new Error("invalid_project_identity");
  }
  if (typeof payload.environment !== "string" || !ALLOWED_ENVIRONMENTS.has(payload.environment)) {
    throw new Error("invalid_environment");
  }
  if (payload.sub !== `owner:${TEAM_SLUG}:project:${PROJECT_NAME}:environment:${payload.environment}`) {
    throw new Error("invalid_subject");
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let identity;
  try {
    identity = await verifyVercel(req);
  } catch (error) {
    console.error("financial-app-db-gateway-auth", error instanceof Error ? error.message : String(error));
    return json({ error: "unauthorized" }, 401);
  }

  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!databaseUrl) return json({ error: "database_url_unavailable" }, 500);
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 5,
    transform: { undefined: null },
  });

  try {
    const body = await readGatewayJsonBody(req);
    const action = body?.action;
    const payload = body?.payload ?? {};

    if (action === "source.capabilities") {
      return json({
        contractVersion: 2,
        sourceAccountLifecycle: true,
        canonicalProductSelection: true,
      });
    }

    if (action === "test.cleanup") {
      if (identity.environment !== "preview") return json({ error: "test_cleanup_preview_only" }, 403);
      await sql.begin(async (tx) => {
        await tx`delete from financial_app.categories where id in (${TEST_CATEGORY_IDS[0]}::uuid,${TEST_CATEGORY_IDS[1]}::uuid)`;
        await tx`delete from financial_app.accounts where id=${TEST_ACCOUNT_ID}::uuid`;
      });
      return json({ ok: true });
    }

    if (action === "health") {
      const rows = await sql`select 1::int as ok`;
      return json({ status: "ok", database: rows[0]?.ok === 1, environment: identity.environment });
    }

    if (action === "test.invariants") {
      if (identity.environment !== "preview") return json({ error: "test_invariants_preview_only" }, 403);
      const rows = await sql`
        select
          pg_catalog.to_regprocedure('financial_app.reorder_accounts(uuid[])') is not null as account_reorder_engine,
          pg_catalog.to_regprocedure('financial_app.reorder_categories(uuid[])') is not null as category_reorder_engine,
          pg_catalog.to_regprocedure('financial_app.merge_categories(uuid,uuid)') is not null as category_merge_engine
      `;
      return json({
        accountReorderEngine: rows[0]?.account_reorder_engine === true,
        categoryReorderEngine: rows[0]?.category_reorder_engine === true,
        categoryMergeEngine: rows[0]?.category_merge_engine === true,
      });
    }

    if (action === "account.list") {
      return json({ rows: await sql`select id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order,created_at,updated_at from financial_app.accounts order by case lifecycle when 'active' then 0 else 1 end,sort_order,name,id` });
    }
    if (action === "account.get") {
      uuid(payload.id, "account_id");
      return json({ rows: await sql`select id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order,created_at,updated_at from financial_app.accounts where id=${payload.id}::uuid` });
    }
    if (action === "account.save") {
      accountPayload(payload.account);
      const a = payload.account;
      return json({ rows: await sql`insert into financial_app.accounts (id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order,created_at,updated_at) values (${a.id}::uuid,${a.name},${a.institution},${a.type},${a.openingBalanceCents},'EUR',${a.lifecycle},${a.sortOrder},${a.createdAt}::timestamptz,${a.updatedAt}::timestamptz) on conflict (id) do update set name=excluded.name,institution=excluded.institution,type=excluded.type,opening_balance_cents=excluded.opening_balance_cents,currency='EUR',lifecycle=excluded.lifecycle,sort_order=excluded.sort_order,updated_at=excluded.updated_at returning id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order,created_at,updated_at` });
    }
    if (action === "account.reorder") {
      orderedIds(payload.orderedIds);
      await sql`select financial_app.reorder_accounts(${payload.orderedIds}::uuid[])`;
      return json({ ok: true });
    }

    if (action === "category.list") {
      return json({ rows: await sql`select id,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order,created_at,updated_at from financial_app.categories order by kind,parent_category_id nulls first,sort_order,name,id` });
    }
    if (action === "category.get") {
      uuid(payload.id, "category_id");
      return json({ rows: await sql`select id,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order,created_at,updated_at from financial_app.categories where id=${payload.id}::uuid` });
    }
    if (action === "category.save") {
      categoryPayload(payload.category);
      const c = payload.category;
      return json({ rows: await sql`insert into financial_app.categories (id,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order,created_at,updated_at) values (${c.id}::uuid,${c.name},${c.kind},${c.parentCategoryId}::uuid,${c.iconKey},${c.colorToken},${c.lifecycle},${c.sortOrder},${c.createdAt}::timestamptz,${c.updatedAt}::timestamptz) on conflict (id) do update set name=excluded.name,kind=excluded.kind,parent_category_id=excluded.parent_category_id,icon_key=excluded.icon_key,color_token=excluded.color_token,lifecycle=excluded.lifecycle,sort_order=excluded.sort_order,updated_at=excluded.updated_at returning id,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order,created_at,updated_at` });
    }
    if (action === "category.reorder") {
      orderedIds(payload.orderedIds);
      await sql`select financial_app.reorder_categories(${payload.orderedIds}::uuid[])`;
      return json({ ok: true });
    }

    if (action === "category.merge") {
      uuid(payload.sourceCategoryId, "source_category_id");
      uuid(payload.targetCategoryId, "target_category_id");
      await sql`select financial_app.merge_categories(${payload.sourceCategoryId}::uuid,${payload.targetCategoryId}::uuid)`;
      return json({ ok: true });
    }

    const merchantAliasResponse = await handleMerchantAliasAction({
      action,
      payload,
      sql,
      environment: identity.environment,
    });
    if (merchantAliasResponse) return merchantAliasResponse;

    const ruleResponse = await handleCategorizationRuleAction({
      action,
      payload,
      sql,
      environment: identity.environment,
    });
    if (ruleResponse) return ruleResponse;

    const googleOauthResponse = await handleGoogleOauthAction({
      action,
      payload,
      sql,
      environment: identity.environment,
    });
    if (googleOauthResponse) return googleOauthResponse;

    const sourceSyncResponse = await handleSourceSyncAction({
      action,
      payload,
      sql,
      environment: identity.environment,
    });
    if (sourceSyncResponse) return sourceSyncResponse;

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    console.error("financial-app-db-gateway", error instanceof Error ? error.message : String(error));
    return json({ error: error instanceof Error ? error.message : "gateway_error" }, 400);
  } finally {
    await sql.end({ timeout: 1 });
  }
});
