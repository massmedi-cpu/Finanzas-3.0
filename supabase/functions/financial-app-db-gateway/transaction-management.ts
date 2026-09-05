const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATCH_FIELDS = new Set([
  "concept",
  "merchantMode",
  "merchantId",
  "categoryMode",
  "categoryId",
  "kind",
  "reviewState",
  "excludedFromAnalytics",
  "note",
]);

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

function transactionIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) {
    throw new Error("invalid_transaction_ids");
  }
  if (value.some((id) => typeof id !== "string" || !UUID.test(id))) {
    throw new Error("invalid_transaction_ids");
  }
  if (new Set(value).size !== value.length) throw new Error("duplicate_transaction_ids");
  return value;
}

function transactionPatch(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_transaction_patch");
  }
  const patch = value as Record<string, unknown>;
  const keys = Object.keys(patch);
  if (keys.length < 1 || keys.some((key) => !PATCH_FIELDS.has(key))) {
    throw new Error("invalid_transaction_patch");
  }
  return patch;
}

export async function handleTransactionManagementAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "transaction.patch") {
    const ids = transactionIds(payload.transactionIds);
    const patch = transactionPatch(payload.patch);
    const rows = await sql`
      select financial_app.apply_transaction_override_patch(${ids}::uuid[],${patch}::jsonb) as result
    `;
    return json({ result: rows[0]?.result ?? null });
  }

  if (action === "test.transaction_management_engine") {
    if (environment !== "preview") {
      return json({ error: "test_transaction_management_engine_preview_only" }, 403);
    }

    const token = crypto.randomUUID().slice(0, 8);
    const sourceFileId = `__phase4_manage_${token}__`;
    const createdTransactionIds: string[] = [];
    let verified = false;

    try {
      await sql.begin(async (tx: any) => {
        const accountRows = await tx`
          insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
          values (${'Phase4 manage account ' + token},'Banco prueba','checking',0,'EUR','active',0)
          returning id
        `;
        const accountId = accountRows[0]?.id;
        if (!accountId) throw new Error("test_transaction_management_account_failed");

        const sourceCategoryRows = await tx`
          insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
          values (${'Phase4 source category ' + token},'expense','basket','neutral','active',0)
          returning id
        `;
        const targetCategoryRows = await tx`
          insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
          values (${'Phase4 target category ' + token},'expense','basket','neutral','active',1)
          returning id
        `;
        const sourceCategoryId = sourceCategoryRows[0]?.id;
        const targetCategoryId = targetCategoryRows[0]?.id;
        if (!sourceCategoryId || !targetCategoryId) throw new Error("test_transaction_management_category_failed");

        const merchantRows = await tx`
          select financial_app.save_merchant(null,${'Phase4 manage merchant ' + token},${targetCategoryId}::uuid,'active') as id
        `;
        const merchantId = merchantRows[0]?.id;
        if (!merchantId) throw new Error("test_transaction_management_merchant_failed");

        const fingerprintA = `${"e".repeat(56)}${token}`;
        const fingerprintB = `${"f".repeat(56)}${token}`;
        const sourceA = await tx`
          insert into financial_app.transaction_source_records(
            source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
            bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
          ) values (
            ${sourceFileId},'sheet-1','ROW-1',${sourceFileId + '::sheet-1::ROW-1'},${fingerprintA},
            ${{ test: token, row: 1 }},'2026-09-05'::date,${'COMPRA MANAGE ' + token},-1234,50000,
            ${'Phase4 manage account ' + token}
          ) returning id
        `;
        const sourceB = await tx`
          insert into financial_app.transaction_source_records(
            source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
            bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
          ) values (
            ${sourceFileId},'sheet-1','ROW-2',${sourceFileId + '::sheet-1::ROW-2'},${fingerprintB},
            ${{ test: token, row: 2 }},'2026-09-04'::date,${'COMPRA MASIVA ' + token},-4321,45679,
            ${'Phase4 manage account ' + token}
          ) returning id
        `;
        const sourceAId = sourceA[0]?.id;
        const sourceBId = sourceB[0]?.id;
        if (!sourceAId || !sourceBId) throw new Error("test_transaction_management_source_failed");

        const transactionA = await tx`
          insert into financial_app.transactions(
            source_record_id,source_row_identity,account_id,bank_date,concept_normalized,merchant_id,category_id,
            kind,amount_cents,balance_after_cents,review_state,duplicate_state
          ) values (
            ${sourceAId}::uuid,${sourceFileId + '::sheet-1::ROW-1'},${accountId}::uuid,'2026-09-05'::date,
            ${'COMPRA MANAGE ' + token},null,null,'expense',-1234,50000,'pending','none'
          ) returning id
        `;
        const transactionB = await tx`
          insert into financial_app.transactions(
            source_record_id,source_row_identity,account_id,bank_date,concept_normalized,merchant_id,category_id,
            kind,amount_cents,balance_after_cents,review_state,duplicate_state
          ) values (
            ${sourceBId}::uuid,${sourceFileId + '::sheet-1::ROW-2'},${accountId}::uuid,'2026-09-04'::date,
            ${'COMPRA MASIVA ' + token},null,${sourceCategoryId}::uuid,'expense',-4321,45679,'pending','none'
          ) returning id
        `;
        const transactionAId = transactionA[0]?.id;
        const transactionBId = transactionB[0]?.id;
        if (!transactionAId || !transactionBId) throw new Error("test_transaction_management_transaction_failed");
        createdTransactionIds.push(transactionAId, transactionBId);

        const firstPatchRows = await tx`
          select financial_app.apply_transaction_override_patch(
            ${[transactionAId]}::uuid[],
            ${{
              concept: "Compra personalizada",
              merchantMode: "set",
              merchantId,
              categoryMode: "set",
              categoryId: targetCategoryId,
              reviewState: "confirmed",
              excludedFromAnalytics: true,
              note: "Revisado manualmente",
            }}::jsonb
          ) as result
        `;
        const firstPatch = firstPatchRows[0]?.result;
        if (firstPatch?.requestedTransactions !== 1 || firstPatch?.changedTransactions !== 1 || (firstPatch?.auditChanges ?? 0) < 6) {
          throw new Error("test_transaction_management_individual_patch_failed");
        }

        const effectiveRows = await tx`
          select financial_app.query_effective_transactions(
            ${token},null,null,null,null,null,null,null,null,null,null,10,false
          ) as result
        `;
        const effectiveA = effectiveRows[0]?.result?.rows?.find((row: any) => row.id === transactionAId);
        if (
          effectiveA?.concept?.effective !== "Compra personalizada" ||
          effectiveA?.merchant?.effectiveId !== merchantId ||
          effectiveA?.category?.effectiveId !== targetCategoryId ||
          effectiveA?.reviewState?.effective !== "confirmed" ||
          effectiveA?.excludedFromAnalytics !== true ||
          effectiveA?.userNote !== "Revisado manualmente" ||
          effectiveA?.hasUserOverride !== true
        ) {
          throw new Error("test_transaction_management_effective_projection_failed");
        }

        const bulkPatchRows = await tx`
          select financial_app.apply_transaction_override_patch(
            ${[transactionAId, transactionBId]}::uuid[],
            ${{ categoryMode: "set", categoryId: targetCategoryId, reviewState: "confirmed" }}::jsonb
          ) as result
        `;
        const bulkPatch = bulkPatchRows[0]?.result;
        if (bulkPatch?.requestedTransactions !== 2 || bulkPatch?.changedTransactions !== 1 || (bulkPatch?.auditChanges ?? 0) < 2) {
          throw new Error("test_transaction_management_bulk_patch_failed");
        }

        const repeatedRows = await tx`
          select financial_app.apply_transaction_override_patch(
            ${[transactionAId, transactionBId]}::uuid[],
            ${{ categoryMode: "set", categoryId: targetCategoryId, reviewState: "confirmed" }}::jsonb
          ) as result
        `;
        if (repeatedRows[0]?.result?.changedTransactions !== 0 || repeatedRows[0]?.result?.auditChanges !== 0) {
          throw new Error("test_transaction_management_idempotence_failed");
        }

        await tx`
          select financial_app.apply_transaction_override_patch(
            ${[transactionAId]}::uuid[],
            ${{
              concept: null,
              merchantMode: "inherit",
              categoryMode: "inherit",
              reviewState: null,
              excludedFromAnalytics: false,
              note: null,
            }}::jsonb
          )
        `;
        const clearedRows = await tx`
          select count(*)::int as count from financial_app.transaction_overrides where transaction_id=${transactionAId}::uuid
        `;
        if (clearedRows[0]?.count !== 0) throw new Error("test_transaction_management_clear_override_failed");

        const uncategorizedRows = await tx`
          select financial_app.query_effective_transactions(
            ${token},null,null,null,null,null,null,null,null,null,null,10,true
          ) as result
        `;
        const uncategorized = uncategorizedRows[0]?.result;
        if (uncategorized?.totalCount !== 1 || uncategorized?.rows?.[0]?.id !== transactionAId) {
          throw new Error("test_transaction_management_uncategorized_filter_failed");
        }

        const sourceCheckRows = await tx`
          select source_row_key,source_fingerprint
          from financial_app.transaction_source_records
          where source_file_id=${sourceFileId}
          order by source_row_key
        `;
        if (
          sourceCheckRows.length !== 2 ||
          sourceCheckRows[0]?.source_fingerprint !== fingerprintA ||
          sourceCheckRows[1]?.source_fingerprint !== fingerprintB
        ) {
          throw new Error("test_transaction_management_source_mutated");
        }

        const auditRows = await tx`
          select count(*)::int as count
          from financial_app.audit_changes
          where entity_id=any(${[transactionAId, transactionBId]}::uuid[]) and change_origin='user'
        `;
        if ((auditRows[0]?.count ?? 0) < 8) throw new Error("test_transaction_management_audit_failed");

        verified = true;
        throw new Error("__ROLLBACK_TRANSACTION_MANAGEMENT_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_TRANSACTION_MANAGEMENT_TEST__") throw error;
    }

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.accounts where name=${'Phase4 manage account ' + token}) as accounts,
        (select count(*)::int from financial_app.categories where name in (${'Phase4 source category ' + token},${'Phase4 target category ' + token})) as categories,
        (select count(*)::int from financial_app.merchants where name=${'Phase4 manage merchant ' + token}) as merchants,
        (select count(*)::int from financial_app.transaction_source_records where source_file_id=${sourceFileId}) as sources,
        (select count(*)::int from financial_app.transactions where source_row_identity like ${sourceFileId + '::%'}) as transactions,
        (select count(*)::int from financial_app.transaction_overrides o join financial_app.transactions t on t.id=o.transaction_id where t.source_row_identity like ${sourceFileId + '::%'}) as overrides,
        (select count(*)::int from financial_app.audit_changes where entity_id=any(${createdTransactionIds}::uuid[])) as audit_changes
    `;
    const residue = residueRows[0] ?? {};
    const clean = ["accounts", "categories", "merchants", "sources", "transactions", "overrides", "audit_changes"]
      .every((key) => residue[key] === 0);

    return json({ verified, clean, residue });
  }

  return null;
}
