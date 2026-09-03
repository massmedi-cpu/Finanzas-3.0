import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import postgres from "postgres";

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
function sameIdSet(current: string[], ordered: string[]) {
  if (current.length !== ordered.length) return false;
  const set = new Set(current);
  return ordered.every((id) => set.has(id));
}
async function applyOrdinalOrder(tx: any, table: "accounts" | "categories", ids: string[]) {
  for (let sortOrder = 0; sortOrder < ids.length; sortOrder += 1) {
    const id = ids[sortOrder];
    if (table === "accounts") {
      await tx`update financial_app.accounts set sort_order=${sortOrder},updated_at=now() where id=${id}::uuid`;
    } else {
      await tx`update financial_app.categories set sort_order=${sortOrder},updated_at=now() where id=${id}::uuid`;
    }
  }
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
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const payload = body?.payload ?? {};

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
      await sql.begin(async (tx) => {
        const current = await tx`select id from financial_app.accounts order by id for update`;
        if (!sameIdSet(current.map((row: any) => String(row.id)), payload.orderedIds)) {
          throw new Error("invalid_reorder_set");
        }
        await applyOrdinalOrder(tx, "accounts", payload.orderedIds);
      });
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
      await sql.begin(async (tx) => {
        const current = await tx`select id from financial_app.categories order by id for update`;
        if (!sameIdSet(current.map((row: any) => String(row.id)), payload.orderedIds)) {
          throw new Error("invalid_reorder_set");
        }
        await applyOrdinalOrder(tx, "categories", payload.orderedIds);
      });
      return json({ ok: true });
    }

    if (action === "category.merge") {
      uuid(payload.sourceCategoryId, "source_category_id");
      uuid(payload.targetCategoryId, "target_category_id");
      if (payload.sourceCategoryId === payload.targetCategoryId) throw new Error("same_category");
      await sql.begin(async (tx) => {
        const categories = await tx`select id,name,kind from financial_app.categories where id in (${payload.sourceCategoryId}::uuid,${payload.targetCategoryId}::uuid) order by id for update`;
        const source = categories.find((row: any) => String(row.id) === payload.sourceCategoryId);
        const target = categories.find((row: any) => String(row.id) === payload.targetCategoryId);
        if (!source || !target) throw new Error("category_not_found");
        if (source.kind !== target.kind) throw new Error("category_kind_mismatch");

        const descendant = await tx`with recursive d as (select id from financial_app.categories where parent_category_id=${payload.sourceCategoryId}::uuid union all select c.id from financial_app.categories c join d on c.parent_category_id=d.id) select exists(select 1 from d where id=${payload.targetCategoryId}::uuid) exists`;
        if (descendant[0]?.exists) throw new Error("target_is_descendant");

        const childCollision = await tx`select exists(select 1 from financial_app.categories sc join financial_app.categories tc on tc.parent_category_id=${payload.targetCategoryId}::uuid and tc.kind=sc.kind and financial_app.normalize_label(tc.name)=financial_app.normalize_label(sc.name) where sc.parent_category_id=${payload.sourceCategoryId}::uuid and sc.id<>tc.id) exists`;
        if (childCollision[0]?.exists) throw new Error("child_category_collision");

        const budgetCollision = await tx`select exists(select 1 from financial_app.budgets sb join financial_app.budgets tb on tb.month=sb.month and tb.category_id=${payload.targetCategoryId}::uuid where sb.category_id=${payload.sourceCategoryId}::uuid) exists`;
        if (budgetCollision[0]?.exists) throw new Error("budget_collision");

        await tx`update financial_app.categories set parent_category_id=${payload.targetCategoryId}::uuid,updated_at=now() where parent_category_id=${payload.sourceCategoryId}::uuid`;
        await tx`update financial_app.merchants set default_category_id=${payload.targetCategoryId}::uuid,updated_at=now() where default_category_id=${payload.sourceCategoryId}::uuid`;
        await tx`update financial_app.transactions set category_id=${payload.targetCategoryId}::uuid,updated_at=now() where category_id=${payload.sourceCategoryId}::uuid`;
        await tx`update financial_app.transaction_overrides set category_id_override=${payload.targetCategoryId}::uuid,updated_at=now() where category_override_set=true and category_id_override=${payload.sourceCategoryId}::uuid`;
        await tx`update financial_app.categorization_rules set target_category_id=${payload.targetCategoryId}::uuid,updated_at=now() where target_category_id=${payload.sourceCategoryId}::uuid`;
        await tx`update financial_app.recurrences set category_id=${payload.targetCategoryId}::uuid,updated_at=now() where category_id=${payload.sourceCategoryId}::uuid`;
        await tx`update financial_app.budgets set category_id=${payload.targetCategoryId}::uuid,updated_at=now() where category_id=${payload.sourceCategoryId}::uuid`;
        await tx`update financial_app.forecast_items set category_id=${payload.targetCategoryId}::uuid,updated_at=now() where category_id=${payload.sourceCategoryId}::uuid`;
        await tx`update financial_app.categories set lifecycle='archived',parent_category_id=null,updated_at=now() where id=${payload.sourceCategoryId}::uuid`;
      });
      return json({ ok: true });
    }

    return json({ error: "unsupported_action" }, 400);
  } catch (error) {
    console.error("financial-app-db-gateway", error instanceof Error ? error.message : String(error));
    return json({ error: error instanceof Error ? error.message : "gateway_error" }, 400);
  } finally {
    await sql.end({ timeout: 1 });
  }
});
