const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["active", "disabled"]);

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

function nullableText(value: unknown, field: string): asserts value is string | null {
  if (value !== null && typeof value !== "string") throw new Error(`invalid_${field}`);
}

function nullableSafeInteger(value: unknown, field: string): asserts value is number | null {
  if (value !== null && (typeof value !== "number" || !Number.isSafeInteger(value))) {
    throw new Error(`invalid_${field}`);
  }
}

function priority(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error("invalid_rule_priority");
  }
}

function status(value: unknown): asserts value is "active" | "disabled" {
  if (typeof value !== "string" || !STATUSES.has(value)) throw new Error("invalid_rule_status");
}

function validateRulePayload(payload: any) {
  nullableUuid(payload.id ?? null, "rule_id");
  text(payload.name, "rule_name");
  status(payload.status);
  priority(payload.priority);
  nullableText(payload.conceptContains ?? null, "concept_contains");
  nullableUuid(payload.merchantId ?? null, "merchant_id");
  nullableUuid(payload.accountId ?? null, "account_id");
  nullableUuid(payload.categoryId ?? null, "category_id");
  nullableSafeInteger(payload.minimumAmountCents ?? null, "minimum_amount_cents");
  nullableSafeInteger(payload.maximumAmountCents ?? null, "maximum_amount_cents");
  nullableUuid(payload.targetCategoryId ?? null, "target_category_id");
  nullableUuid(payload.targetMerchantId ?? null, "target_merchant_id");

  if (
    payload.conceptContains === null &&
    payload.merchantId === null &&
    payload.accountId === null &&
    payload.categoryId === null &&
    payload.minimumAmountCents === null &&
    payload.maximumAmountCents === null
  ) {
    throw new Error("rule_condition_required");
  }
  if (payload.targetCategoryId === null && payload.targetMerchantId === null) {
    throw new Error("rule_target_required");
  }
  if (
    payload.minimumAmountCents !== null &&
    payload.maximumAmountCents !== null &&
    payload.minimumAmountCents > payload.maximumAmountCents
  ) {
    throw new Error("invalid_rule_amount_range");
  }
}

async function listRules(sql: any) {
  return sql`
    select
      r.id,r.name,r.status,r.priority,r.concept_contains,r.merchant_id,r.account_id,r.category_id,
      r.minimum_amount_cents,r.maximum_amount_cents,r.target_category_id,r.target_merchant_id,
      r.created_at,r.updated_at,
      cm.name as merchant_name,
      a.name as account_name,
      cc.name as category_name,
      tc.name as target_category_name,
      tm.name as target_merchant_name
    from financial_app.categorization_rules r
    left join financial_app.merchants cm on cm.id=r.merchant_id
    left join financial_app.accounts a on a.id=r.account_id
    left join financial_app.categories cc on cc.id=r.category_id
    left join financial_app.categories tc on tc.id=r.target_category_id
    left join financial_app.merchants tm on tm.id=r.target_merchant_id
    order by case r.status when 'active' then 0 else 1 end,r.priority,r.id
  `;
}

export async function handleCategorizationRuleAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "rule.list") {
    return json({ rows: await listRules(sql) });
  }

  if (action === "rule.save") {
    validateRulePayload(payload);
    const saved = await sql`
      select financial_app.save_categorization_rule(
        ${payload.id ?? null}::uuid,
        ${payload.name},
        ${payload.status},
        ${payload.priority},
        ${payload.conceptContains ?? null},
        ${payload.merchantId ?? null}::uuid,
        ${payload.accountId ?? null}::uuid,
        ${payload.categoryId ?? null}::uuid,
        ${payload.minimumAmountCents ?? null}::bigint,
        ${payload.maximumAmountCents ?? null}::bigint,
        ${payload.targetCategoryId ?? null}::uuid,
        ${payload.targetMerchantId ?? null}::uuid
      ) as id
    `;
    const ruleId = saved[0]?.id;
    if (!ruleId) throw new Error("rule_save_failed");
    const rows = await listRules(sql);
    return json({ rule: rows.find((row: any) => row.id === ruleId) ?? null });
  }

  if (action === "rule.evaluate") {
    uuid(payload.transactionId, "transaction_id");
    const rows = await sql`
      select financial_app.evaluate_categorization_rule(${payload.transactionId}::uuid) as result
    `;
    return json({ result: rows[0]?.result ?? null });
  }

  if (action === "rule.apply") {
    uuid(payload.transactionId, "transaction_id");
    const rows = await sql`
      select financial_app.apply_categorization_rule(${payload.transactionId}::uuid) as result
    `;
    return json({ result: rows[0]?.result ?? null });
  }

  if (action === "rule.apply_all") {
    const limit = payload.limit ?? 10000;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10000) {
      throw new Error("invalid_rule_apply_limit");
    }
    const rows = await sql`
      select financial_app.apply_categorization_rules(${limit}::integer) as result
    `;
    return json({ result: rows[0]?.result ?? null });
  }

  if (action === "test.categorization_rule_engine") {
    if (environment !== "preview") return json({ error: "test_rule_engine_preview_only" }, 403);

    const token = crypto.randomUUID().replaceAll("-", "");
    const sourceFileId = `__phase3_rule_gateway__${token}`;
    const rowIdentity = `${sourceFileId}::sheet-1::ROW-1`;
    const fingerprint = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    let verified = false;
    let deterministicRuleId: string | null = null;

    try {
      await sql.begin(async (tx: any) => {
        const accountRows = await tx`
          insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
          values (${'Rule gateway account ' + token},'Test','checking',0,'EUR','active',0)
          returning id
        `;
        const accountId = accountRows[0]?.id;
        if (!accountId) throw new Error("test_rule_account_create_failed");

        const sourceCategoryRows = await tx`
          insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
          values (${'Rule gateway source ' + token},'expense','test','neutral','active',0)
          returning id
        `;
        const targetCategoryRows = await tx`
          insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
          values (${'Rule gateway target ' + token},'expense','test','neutral','active',0)
          returning id
        `;
        const sourceCategoryId = sourceCategoryRows[0]?.id;
        const targetCategoryId = targetCategoryRows[0]?.id;
        if (!sourceCategoryId || !targetCategoryId) throw new Error("test_rule_category_create_failed");

        const merchantRows = await tx`
          select financial_app.save_merchant(
            null,
            ${'Café Regla ' + token},
            ${sourceCategoryId}::uuid,
            'active'
          ) as id
        `;
        const merchantId = merchantRows[0]?.id;
        if (!merchantId) throw new Error("test_rule_merchant_create_failed");
        await tx`
          select financial_app.save_merchant_alias(
            null,
            ${merchantId}::uuid,
            ${'TPV CAFÉ REGLA VIP ' + token}
          )
        `;

        const sourceRows = await tx`
          insert into financial_app.transaction_source_records(
            source_file_id,source_sheet_id,source_row_key,source_fingerprint,source_payload,bank_date,
            concept_original,amount_cents,balance_after_cents,account_external_key,source_row_identity
          ) values (
            ${sourceFileId},'sheet-1','ROW-1',${fingerprint},${{ test: true }},'2026-09-05'::date,
            ${'TPV CAFÉ REGLA VIP ' + token},-12345,100000,${'Rule gateway account ' + token},${rowIdentity}
          ) returning id
        `;
        const sourceRecordId = sourceRows[0]?.id;
        if (!sourceRecordId) throw new Error("test_rule_source_create_failed");

        const transactionRows = await tx`
          insert into financial_app.transactions(
            source_record_id,account_id,bank_date,concept_normalized,merchant_id,category_id,kind,amount_cents,
            balance_after_cents,review_state,duplicate_state,source_row_identity
          ) values (
            ${sourceRecordId}::uuid,${accountId}::uuid,'2026-09-05'::date,${'TPV CAFÉ REGLA VIP ' + token},
            null,null,'expense',-12345,100000,'pending','none',${rowIdentity}
          ) returning id
        `;
        const transactionId = transactionRows[0]?.id;
        if (!transactionId) throw new Error("test_rule_transaction_create_failed");

        await tx`
          select financial_app.save_categorization_rule(
            null,${'Disabled ' + token},'disabled',0,'cafe',null,null,null,null,null,${sourceCategoryId}::uuid,null
          )
        `;
        await tx`
          select financial_app.save_categorization_rule(
            null,${'Low ' + token},'active',200,'cafe',null,null,null,null,null,${sourceCategoryId}::uuid,null
          )
        `;
        const highRows = await tx`
          select financial_app.save_categorization_rule(
            null,${'High ' + token},'active',10,'CAFÉ',${merchantId}::uuid,${accountId}::uuid,${sourceCategoryId}::uuid,
            -13000,-12000,${targetCategoryId}::uuid,null
          ) as id
        `;
        deterministicRuleId = highRows[0]?.id ?? null;
        if (!deterministicRuleId) throw new Error("test_rule_high_create_failed");

        const evaluationRows = await tx`
          select financial_app.evaluate_categorization_rule(${transactionId}::uuid) as result
        `;
        const evaluation = evaluationRows[0]?.result;
        if (
          evaluation?.selectedRuleId !== deterministicRuleId ||
          evaluation?.selectedRulePriority !== 10 ||
          evaluation?.baselineMerchantId !== merchantId ||
          evaluation?.baselineCategoryId !== sourceCategoryId ||
          evaluation?.resolvedCategoryId !== targetCategoryId
        ) {
          throw new Error("test_rule_deterministic_evaluation_failed");
        }

        const applyRows = await tx`
          select financial_app.apply_categorization_rule(${transactionId}::uuid) as result
        `;
        const applied = applyRows[0]?.result;
        const storedRows = await tx`
          select merchant_id,category_id from financial_app.transactions where id=${transactionId}::uuid
        `;
        if (
          applied?.merchantChanged !== true ||
          applied?.categoryChanged !== true ||
          storedRows[0]?.merchant_id !== merchantId ||
          storedRows[0]?.category_id !== targetCategoryId
        ) {
          throw new Error("test_rule_apply_failed");
        }

        await tx`
          insert into financial_app.transaction_overrides(transaction_id,category_id_override,category_override_set,note)
          values (${transactionId}::uuid,${sourceCategoryId}::uuid,true,'manual lock')
        `;
        const lockedRows = await tx`
          select financial_app.apply_categorization_rule(${transactionId}::uuid) as result
        `;
        const locked = lockedRows[0]?.result;
        const afterLockRows = await tx`
          select category_id from financial_app.transactions where id=${transactionId}::uuid
        `;
        if (
          locked?.categoryLocked !== true ||
          locked?.categoryChanged !== false ||
          locked?.resolvedCategoryId !== sourceCategoryId ||
          afterLockRows[0]?.category_id !== targetCategoryId
        ) {
          throw new Error("test_rule_manual_override_failed");
        }

        const auditRows = await tx`
          select
            count(*) filter (where entity_type='rule')::int as rule_changes,
            count(*) filter (where entity_type='transaction')::int as transaction_changes
          from financial_app.audit_changes
          where entity_id in (${transactionId}::uuid,${deterministicRuleId}::uuid)
        `;
        if ((auditRows[0]?.rule_changes ?? 0) < 1 || (auditRows[0]?.transaction_changes ?? 0) < 2) {
          throw new Error("test_rule_audit_failed");
        }

        verified = true;
        throw new Error("__ROLLBACK_RULE_ENGINE_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_RULE_ENGINE_TEST__") throw error;
    }

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.accounts where name=${'Rule gateway account ' + token}) as accounts,
        (select count(*)::int from financial_app.categories where name in (${'Rule gateway source ' + token},${'Rule gateway target ' + token})) as categories,
        (select count(*)::int from financial_app.merchants where name=${'Café Regla ' + token}) as merchants,
        (select count(*)::int from financial_app.merchant_aliases where alias=${'TPV CAFÉ REGLA VIP ' + token}) as aliases,
        (select count(*)::int from financial_app.categorization_rules where name like ${'%' + token}) as rules,
        (select count(*)::int from financial_app.transaction_source_records where source_file_id=${sourceFileId}) as sources,
        (select count(*)::int from financial_app.transactions where source_row_identity=${rowIdentity}) as transactions,
        (select count(*)::int from financial_app.transaction_overrides o join financial_app.transactions t on t.id=o.transaction_id where t.source_row_identity=${rowIdentity}) as overrides
    `;
    const residue = residueRows[0] ?? {};
    const clean = ["accounts", "categories", "merchants", "aliases", "rules", "sources", "transactions", "overrides"]
      .every((key) => residue[key] === 0);

    return json({ verified, clean, deterministicRuleId, residue });
  }

  return null;
}
