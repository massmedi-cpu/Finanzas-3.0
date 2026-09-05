const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["income", "expense", "transfer", "refund", "adjustment"]);
const REVIEW_STATES = new Set(["confirmed", "pending", "needs_review"]);
const DUPLICATE_STATES = new Set(["none", "suspected", "confirmed"]);

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

function nullableUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`invalid_${field}`);
  return value;
}

function nullableText(value: unknown, field: string, maxLength = 160): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error(`invalid_${field}`);
  return normalized;
}

function nullableDate(value: unknown, field: string): string | null {
  const text = nullableText(value, field, 10);
  if (text === null) return null;
  if (!DATE.test(text)) throw new Error(`invalid_${field}`);
  return text;
}

function enumValue(value: unknown, field: string, allowed: Set<string>): string | null {
  const text = nullableText(value, field, 32);
  if (text === null) return null;
  if (!allowed.has(text)) throw new Error(`invalid_${field}`);
  return text;
}

function pageLimit(value: unknown) {
  if (value === undefined || value === null || value === "") return 50;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("invalid_transaction_page_limit");
  }
  return value;
}

function booleanValue(value: unknown, field: string) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") throw new Error(`invalid_${field}`);
  return value;
}

export async function handleTransactionQueryAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "transaction.query") {
    const query = nullableText(payload.query, "transaction_query");
    const accountId = nullableUuid(payload.accountId, "transaction_account_id");
    const categoryId = nullableUuid(payload.categoryId, "transaction_category_id");
    const merchantId = nullableUuid(payload.merchantId, "transaction_merchant_id");
    const kind = enumValue(payload.kind, "transaction_kind", KINDS);
    const reviewState = enumValue(payload.reviewState, "transaction_review_state", REVIEW_STATES);
    const duplicateState = enumValue(payload.duplicateState, "transaction_duplicate_state", DUPLICATE_STATES);
    const dateFrom = nullableDate(payload.dateFrom, "transaction_date_from");
    const dateTo = nullableDate(payload.dateTo, "transaction_date_to");
    const cursorBankDate = nullableDate(payload.cursorBankDate, "transaction_cursor_bank_date");
    const cursorId = nullableUuid(payload.cursorId, "transaction_cursor_id");
    const limit = pageLimit(payload.limit);
    const uncategorized = booleanValue(payload.uncategorized, "transaction_uncategorized");

    if ((cursorBankDate === null) !== (cursorId === null)) throw new Error("invalid_transaction_cursor");

    const rows = await sql`
      select financial_app.query_effective_transactions(
        ${query},
        ${accountId}::uuid,
        ${categoryId}::uuid,
        ${merchantId}::uuid,
        ${kind},
        ${reviewState},
        ${duplicateState},
        ${dateFrom}::date,
        ${dateTo}::date,
        ${cursorBankDate}::date,
        ${cursorId}::uuid,
        ${limit},
        ${uncategorized}
      ) as result
    `;
    return json(rows[0]?.result ?? { rows: [], totalCount: 0, hasMore: false, nextCursor: null });
  }

  if (action === "transaction.facets") {
    const [accounts, categories, merchants] = await Promise.all([
      sql`select id,name,lifecycle,sort_order from financial_app.accounts order by case lifecycle when 'active' then 0 else 1 end,sort_order,name,id`,
      sql`select id,name,kind,lifecycle,parent_category_id,sort_order from financial_app.categories order by case lifecycle when 'active' then 0 else 1 end,kind,parent_category_id nulls first,sort_order,name,id`,
      sql`select id,name,lifecycle from financial_app.merchants order by case lifecycle when 'active' then 0 else 1 end,normalized_name,id`,
    ]);
    return json({ accounts, categories, merchants });
  }

  if (action === "test.transaction_query_engine") {
    if (environment !== "preview") return json({ error: "test_transaction_query_engine_preview_only" }, 403);

    const token = crypto.randomUUID().slice(0, 8);
    const sourceFileId = `__phase4_query_${token}__`;
    let verified = false;

    try {
      await sql.begin(async (tx: any) => {
        const accountRows = await tx`
          insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
          values (${'Phase4 query account ' + token},'Banco prueba','checking',0,'EUR','active',0)
          returning id
        `;
        const accountId = accountRows[0]?.id;
        if (!accountId) throw new Error("test_transaction_query_account_failed");

        const categoryRows = await tx`
          insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
          values (${'Phase4 query category ' + token},'expense','basket','neutral','active',0)
          returning id
        `;
        const categoryId = categoryRows[0]?.id;
        if (!categoryId) throw new Error("test_transaction_query_category_failed");

        const merchantRows = await tx`
          select financial_app.save_merchant(null,${'Phase4 query merchant ' + token},${categoryId}::uuid,'active') as id
        `;
        const merchantId = merchantRows[0]?.id;
        if (!merchantId) throw new Error("test_transaction_query_merchant_failed");

        const sourceA = await tx`
          insert into financial_app.transaction_source_records(
            source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
            bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
          ) values (
            ${sourceFileId},'sheet-1','ROW-1',${sourceFileId + '::sheet-1::ROW-1'},${'a'.repeat(56) + token},
            ${{ test: token, row: 1 }},'2026-09-05'::date,${'SUPERMERCADO TEST ' + token},-1234,50000,
            ${'Phase4 query account ' + token}
          ) returning id
        `;
        const sourceAId = sourceA[0]?.id;
        if (!sourceAId) throw new Error("test_transaction_query_source_a_failed");

        const sourceB = await tx`
          insert into financial_app.transaction_source_records(
            source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
            bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
          ) values (
            ${sourceFileId},'sheet-1','ROW-2',${sourceFileId + '::sheet-1::ROW-2'},${'b'.repeat(56) + token},
            ${{ test: token, row: 2 }},'2026-09-04'::date,${'NOMINA TEST ' + token},200000,250000,
            ${'Phase4 query account ' + token}
          ) returning id
        `;
        const sourceBId = sourceB[0]?.id;
        if (!sourceBId) throw new Error("test_transaction_query_source_b_failed");

        const txA = await tx`
          insert into financial_app.transactions(
            source_record_id,source_row_identity,account_id,bank_date,concept_normalized,merchant_id,category_id,
            kind,amount_cents,balance_after_cents,review_state,duplicate_state
          ) values (
            ${sourceAId}::uuid,${sourceFileId + '::sheet-1::ROW-1'},${accountId}::uuid,'2026-09-05'::date,
            ${'SUPERMERCADO TEST ' + token},null,null,'expense',-1234,50000,'pending','none'
          ) returning id
        `;
        const transactionAId = txA[0]?.id;
        if (!transactionAId) throw new Error("test_transaction_query_tx_a_failed");

        const txB = await tx`
          insert into financial_app.transactions(
            source_record_id,source_row_identity,account_id,bank_date,concept_normalized,merchant_id,category_id,
            kind,amount_cents,balance_after_cents,review_state,duplicate_state
          ) values (
            ${sourceBId}::uuid,${sourceFileId + '::sheet-1::ROW-2'},${accountId}::uuid,'2026-09-04'::date,
            ${'NOMINA TEST ' + token},null,null,'income',200000,250000,'pending','none'
          ) returning id
        `;
        if (!txB[0]?.id) throw new Error("test_transaction_query_tx_b_failed");

        await tx`
          insert into financial_app.transaction_overrides(
            transaction_id,concept_override,merchant_id_override,merchant_override_set,
            category_id_override,category_override_set,review_state_override,note
          ) values (
            ${transactionAId}::uuid,'Compra mercado personalizada',${merchantId}::uuid,true,
            ${categoryId}::uuid,true,'confirmed','Override de prueba Phase4'
          )
        `;

        const firstRows = await tx`
          select financial_app.query_effective_transactions(
            ${token},null,null,null,null,null,null,null,null,null,null,1,false
          ) as result
        `;
        const first = firstRows[0]?.result;
        const firstItem = first?.rows?.[0];
        if (
          first?.totalCount !== 2 || first?.hasMore !== true || first?.rows?.length !== 1 ||
          firstItem?.id !== transactionAId ||
          firstItem?.concept?.original !== `SUPERMERCADO TEST ${token}` ||
          firstItem?.concept?.effective !== 'Compra mercado personalizada' ||
          firstItem?.category?.originalId !== null ||
          firstItem?.category?.effectiveId !== categoryId ||
          firstItem?.merchant?.effectiveId !== merchantId ||
          firstItem?.reviewState?.effective !== 'confirmed' ||
          firstItem?.hasUserOverride !== true ||
          firstItem?.source?.sourceRowKey !== 'ROW-1'
        ) {
          throw new Error("test_transaction_query_projection_failed");
        }

        const cursor = first?.nextCursor;
        if (!cursor?.bankDate || !cursor?.id) throw new Error("test_transaction_query_cursor_missing");
        const secondRows = await tx`
          select financial_app.query_effective_transactions(
            ${token},null,null,null,null,null,null,null,null,${cursor.bankDate}::date,${cursor.id}::uuid,1,false
          ) as result
        `;
        const second = secondRows[0]?.result;
        if (second?.rows?.length !== 1 || second?.rows?.[0]?.concept?.original !== `NOMINA TEST ${token}`) {
          throw new Error("test_transaction_query_cursor_failed");
        }

        const categoryRowsFiltered = await tx`
          select financial_app.query_effective_transactions(
            null,null,${categoryId}::uuid,null,null,null,null,null,null,null,null,10,false
          ) as result
        `;
        if (categoryRowsFiltered[0]?.result?.totalCount !== 1) {
          throw new Error("test_transaction_query_effective_filter_failed");
        }

        const uncategorizedRows = await tx`
          select financial_app.query_effective_transactions(
            null,null,null,null,null,null,null,null,null,null,null,10,true
          ) as result
        `;
        if (uncategorizedRows[0]?.result?.totalCount !== 1 || uncategorizedRows[0]?.result?.rows?.[0]?.id !== txB[0]?.id) {
          throw new Error("test_transaction_query_uncategorized_filter_failed");
        }

        verified = true;
        throw new Error("__ROLLBACK_TRANSACTION_QUERY_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_TRANSACTION_QUERY_TEST__") throw error;
    }

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.accounts where name=${'Phase4 query account ' + token}) as accounts,
        (select count(*)::int from financial_app.categories where name=${'Phase4 query category ' + token}) as categories,
        (select count(*)::int from financial_app.merchants where name=${'Phase4 query merchant ' + token}) as merchants,
        (select count(*)::int from financial_app.transaction_source_records where source_file_id=${sourceFileId}) as sources,
        (select count(*)::int from financial_app.transactions where source_row_identity like ${sourceFileId + '::%'}) as transactions,
        (select count(*)::int from financial_app.transaction_overrides o join financial_app.transactions t on t.id=o.transaction_id where t.source_row_identity like ${sourceFileId + '::%'}) as overrides
    `;
    const residue = residueRows[0] ?? {};
    const clean = ["accounts", "categories", "merchants", "sources", "transactions", "overrides"].every(
      (key) => residue[key] === 0,
    );

    return json({ verified, clean, residue });
  }

  return null;
}
