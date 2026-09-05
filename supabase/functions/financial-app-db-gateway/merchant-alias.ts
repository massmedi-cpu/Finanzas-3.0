const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIFECYCLES = new Set(["active", "archived"]);

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

function nullableUuid(value: unknown, field: string): asserts value is string | null {
  if (value !== null && (typeof value !== "string" || !UUID.test(value))) {
    throw new Error(`invalid_${field}`);
  }
}

function uuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`invalid_${field}`);
}

function text(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`invalid_${field}`);
}

function lifecycle(value: unknown): asserts value is "active" | "archived" {
  if (typeof value !== "string" || !LIFECYCLES.has(value)) throw new Error("invalid_merchant_lifecycle");
}

export async function handleMerchantAliasAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "merchant.list") {
    const rows = await sql`
      select
        m.id,m.name,m.normalized_name,m.default_category_id,m.lifecycle,m.created_at,m.updated_at,
        c.name as default_category_name,c.kind as default_category_kind,c.lifecycle as default_category_lifecycle,
        count(a.id)::int as alias_count
      from financial_app.merchants m
      left join financial_app.categories c on c.id=m.default_category_id
      left join financial_app.merchant_aliases a on a.merchant_id=m.id
      group by m.id,c.id
      order by case m.lifecycle when 'active' then 0 else 1 end,m.normalized_name,m.id
    `;
    return json({ rows });
  }

  if (action === "merchant.save") {
    nullableUuid(payload.id ?? null, "merchant_id");
    text(payload.name, "merchant_name");
    nullableUuid(payload.defaultCategoryId ?? null, "default_category_id");
    lifecycle(payload.lifecycle);

    const saved = await sql`
      select financial_app.save_merchant(
        ${payload.id ?? null}::uuid,
        ${payload.name},
        ${payload.defaultCategoryId ?? null}::uuid,
        ${payload.lifecycle}
      ) as id
    `;
    const merchantId = saved[0]?.id;
    if (!merchantId) throw new Error("merchant_save_failed");

    const rows = await sql`
      select id,name,normalized_name,default_category_id,lifecycle,created_at,updated_at
      from financial_app.merchants
      where id=${merchantId}::uuid
    `;
    return json({ merchant: rows[0] ?? null });
  }

  if (action === "merchant_alias.list") {
    const merchantId = payload.merchantId ?? null;
    nullableUuid(merchantId, "merchant_id");
    const rows = merchantId
      ? await sql`
          select id,merchant_id,alias,normalized_alias,created_at,updated_at
          from financial_app.merchant_aliases
          where merchant_id=${merchantId}::uuid
          order by normalized_alias,id
        `
      : await sql`
          select id,merchant_id,alias,normalized_alias,created_at,updated_at
          from financial_app.merchant_aliases
          order by normalized_alias,id
        `;
    return json({ rows });
  }

  if (action === "merchant_alias.save") {
    nullableUuid(payload.id ?? null, "merchant_alias_id");
    uuid(payload.merchantId, "merchant_id");
    text(payload.alias, "merchant_alias");

    const saved = await sql`
      select financial_app.save_merchant_alias(
        ${payload.id ?? null}::uuid,
        ${payload.merchantId}::uuid,
        ${payload.alias}
      ) as id
    `;
    const aliasId = saved[0]?.id;
    if (!aliasId) throw new Error("merchant_alias_save_failed");

    const rows = await sql`
      select id,merchant_id,alias,normalized_alias,created_at,updated_at
      from financial_app.merchant_aliases
      where id=${aliasId}::uuid
    `;
    return json({ alias: rows[0] ?? null });
  }

  if (action === "merchant_alias.delete") {
    uuid(payload.id, "merchant_alias_id");
    const rows = await sql`
      select financial_app.delete_merchant_alias(${payload.id}::uuid) as deleted
    `;
    return json({ deleted: rows[0]?.deleted === true });
  }

  if (action === "merchant.resolve") {
    text(payload.label, "merchant_label");
    const rows = await sql`
      select
        m.id,m.name,m.normalized_name,m.default_category_id,m.lifecycle,
        financial_app.resolve_merchant_default_category_id(m.id) as effective_default_category_id
      from financial_app.merchants m
      where m.id=financial_app.resolve_merchant_id(${payload.label})
      limit 1
    `;
    return json({ merchant: rows[0] ?? null });
  }

  if (action === "test.merchant_alias_engine") {
    if (environment !== "preview") return json({ error: "test_merchant_alias_engine_preview_only" }, 403);

    let verified = false;
    const token = crypto.randomUUID().slice(0, 8);
    try {
      await sql.begin(async (tx: any) => {
        const categoryRows = await tx`
          insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
          values (${'Phase3 merchant test ' + token},'expense','store','neutral','active',0)
          returning id
        `;
        const categoryId = categoryRows[0]?.id;
        if (!categoryId) throw new Error("test_merchant_category_create_failed");

        const merchantRows = await tx`
          select financial_app.save_merchant(
            null,
            ${'Café Phase3 ' + token},
            ${categoryId}::uuid,
            'active'
          ) as id
        `;
        const merchantId = merchantRows[0]?.id;
        if (!merchantId) throw new Error("test_merchant_create_failed");

        const aliasRows = await tx`
          select financial_app.save_merchant_alias(
            null,
            ${merchantId}::uuid,
            ${'TPV-' + token + ' / Café Phase3'}
          ) as id
        `;
        const aliasId = aliasRows[0]?.id;
        if (!aliasId) throw new Error("test_merchant_alias_create_failed");

        const normalizedRows = await tx`
          select name,normalized_name
          from financial_app.merchants
          where id=${merchantId}::uuid
        `;
        if (normalizedRows[0]?.normalized_name !== `cafe phase3 ${token}`) {
          throw new Error("test_merchant_normalization_failed");
        }

        const resolvedRows = await tx`
          select
            financial_app.resolve_merchant_id(${'TPV ' + token + ' Cafe Phase3'}) as merchant_id,
            financial_app.resolve_merchant_default_category_id(${merchantId}::uuid) as category_id
        `;
        if (
          resolvedRows[0]?.merchant_id !== merchantId ||
          resolvedRows[0]?.category_id !== categoryId
        ) {
          throw new Error("test_merchant_resolution_failed");
        }

        let collisionBlocked = false;
        try {
          await tx`
            select financial_app.save_merchant_alias(null,${merchantId}::uuid,${'Café Phase3 ' + token})
          `;
        } catch (error) {
          collisionBlocked = error instanceof Error && error.message.includes("merchant_alias_conflicts_with_canonical_name");
        }
        if (!collisionBlocked) throw new Error("test_merchant_collision_not_blocked");

        const deletedRows = await tx`
          select financial_app.delete_merchant_alias(${aliasId}::uuid) as deleted
        `;
        if (deletedRows[0]?.deleted !== true) throw new Error("test_merchant_alias_delete_failed");

        verified = true;
        throw new Error("__ROLLBACK_MERCHANT_ALIAS_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_MERCHANT_ALIAS_TEST__") throw error;
    }

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.merchants where name like ${'%Phase3 ' + token}) as merchants,
        (select count(*)::int from financial_app.merchant_aliases where alias like ${'%' + token + '%'}) as aliases,
        (select count(*)::int from financial_app.categories where name=${'Phase3 merchant test ' + token}) as categories
    `;
    const residue = residueRows[0] ?? {};
    return json({
      verified,
      clean: residue.merchants === 0 && residue.aliases === 0 && residue.categories === 0,
      residue,
    });
  }

  return null;
}
