const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

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

function budgetDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "budget_category_not_found") {
    return json({ error: "budget_category_not_found" }, 404);
  }
  if (
    message === "budget_category_must_be_expense" ||
    message === "invalid_budget_month" ||
    message === "invalid_budget_manual_amount"
  ) {
    return json({ error: message }, 400);
  }
  console.error("budget-logic-database", error instanceof Error ? error.name : typeof error);
  return json({ error: "budget_internal_error" }, 500);
}

async function budgetQuery(run: () => Promise<any>) {
  try {
    const rows = await run();
    return json(rows[0]?.result ?? null);
  } catch (error) {
    return budgetDatabaseError(error);
  }
}

function monthValue(value: unknown, field = "budget_month") {
  if (typeof value !== "string" || !MONTH.test(value)) throw new Error(`invalid_${field}`);
  const year = Number(value.slice(0, 4));
  if (!Number.isInteger(year) || year < 1) throw new Error(`invalid_${field}`);
  return value;
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`invalid_${field}`);
  return value;
}

function nullableNonNegativeCents(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_SAFE_CENTS
  ) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function fingerprint(token: string, counter: number) {
  return `${token}${counter.toString(16).padStart(8, "0")}`.padEnd(64, "a").slice(0, 64);
}

export async function handleBudgetLogicAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "budget.snapshot") {
    const month = monthValue(payload.month);
    return budgetQuery(() => sql`
      select financial_app.budget_month_snapshot(${month}) as result
    `);
  }

  if (action === "budget.refresh") {
    const month = monthValue(payload.month);
    return budgetQuery(() => sql`
      select financial_app.refresh_budget_month(${month}) as result
    `);
  }

  if (action === "budget.set_manual") {
    const month = monthValue(payload.month);
    const categoryId = nullableUuid(payload.categoryId, "budget_category_id");
    const manualAmountCents = nullableNonNegativeCents(
      payload.manualAmountCents,
      "budget_manual_amount",
    );
    return budgetQuery(() => sql`
      select financial_app.set_budget_manual_amount(
        ${month},${categoryId}::uuid,${manualAmountCents}::bigint
      ) as result
    `);
  }

  if (action === "test.budget_engine") {
    if (environment !== "preview") return json({ error: "test_budget_engine_preview_only" }, 403);

    const token = crypto.randomUUID().slice(0, 8);
    const sourceFileId = `__phase6_budget_${token}__`;
    const parentCategoryId = crypto.randomUUID();
    const childCategoryId = crypto.randomUUID();
    const createdBudgetIds: string[] = [];
    let verified = false;
    let sourceCounter = 0;

    try {
      await sql.begin(async (tx: any) => {
        const accountRows = await tx`
          select id from financial_app.accounts
          where lifecycle='active'
          order by sort_order,name,id
          limit 1
        `;
        const accountId = accountRows[0]?.id;
        if (!accountId) throw new Error("test_budget_account_unavailable");

        await tx`
          insert into financial_app.categories(
            id,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order
          ) values
            (${parentCategoryId}::uuid,${`Phase6 parent ${token}`},'expense',null,'wallet','budget-parent','active',9000),
            (${childCategoryId}::uuid,${`Phase6 child ${token}`},'expense',${parentCategoryId}::uuid,'cart','budget-child','active',9001)
        `;

        const add = async (
          date: string,
          amountCents: number,
          kind = "expense",
          duplicateState = "none",
          excluded = false,
        ) => {
          sourceCounter += 1;
          const key = `B6-${sourceCounter}`;
          const rowIdentity = `${sourceFileId}::sheet-1::${key}`;
          const sourceRows = await tx`
            insert into financial_app.transaction_source_records(
              source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,
              source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
            ) values (
              ${sourceFileId},'sheet-1',${key},${rowIdentity},${fingerprint(token, sourceCounter)},
              ${{ test: token, key }},${date}::date,${`PHASE6 ${key}`},${amountCents},null,${`Phase6 account ${token}`}
            ) returning id
          `;
          const sourceId = sourceRows[0]?.id;
          if (!sourceId) throw new Error("test_budget_source_failed");

          const transactionRows = await tx`
            insert into financial_app.transactions(
              source_record_id,source_row_identity,account_id,bank_date,concept_normalized,
              category_id,kind,amount_cents,balance_after_cents,review_state,duplicate_state
            ) values (
              ${sourceId}::uuid,${rowIdentity},${accountId}::uuid,${date}::date,${`PHASE6 ${key}`},
              ${childCategoryId}::uuid,${kind},${amountCents},null,'confirmed',${duplicateState}
            ) returning id
          `;
          const transactionId = transactionRows[0]?.id;
          if (!transactionId) throw new Error("test_budget_transaction_failed");

          if (excluded) {
            await tx`
              insert into financial_app.transaction_overrides(transaction_id,excluded_from_analytics)
              values(${transactionId}::uuid,true)
            `;
          }
        };

        await add('2098-01-10',-10000);
        await add('2098-02-10',-20000);
        await add('2098-03-10',-30000);
        await add('2098-04-10',-25000);
        await add('2098-04-11',-50000,'transfer');
        await add('2098-04-12',-9000,'expense','confirmed');
        await add('2098-04-13',-7000,'expense','none',true);

        const snapshotRows = await tx`
          select financial_app.budget_month_snapshot('2098-04') as result
        `;
        const snapshot = snapshotRows[0]?.result;
        const parent = snapshot?.categories?.find((row: any) => row.categoryId === parentCategoryId);
        const child = snapshot?.categories?.find((row: any) => row.categoryId === childCategoryId);

        const refreshedRows = await tx`
          select financial_app.refresh_budget_month('2098-04') as result
        `;
        const refreshed = refreshedRows[0]?.result;
        const refreshedParent = refreshed?.categories?.find((row: any) => row.categoryId === parentCategoryId);
        const refreshedChild = refreshed?.categories?.find((row: any) => row.categoryId === childCategoryId);
        for (const row of [refreshed?.total, refreshedParent, refreshedChild]) {
          if (typeof row?.id === "string") createdBudgetIds.push(row.id);
        }

        const manualRows = await tx`
          select financial_app.set_budget_manual_amount(
            '2098-04',${parentCategoryId}::uuid,30000::bigint
          ) as result
        `;
        const manualParent = manualRows[0]?.result?.categories?.find(
          (row: any) => row.categoryId === parentCategoryId,
        );

        const auditRows = await tx`
          select count(*)::int as count
          from financial_app.audit_changes
          where entity_type='budget'
            and entity_id=${manualParent?.id}::uuid
            and field_name='manual_amount_cents'
        `;

        const clearedRows = await tx`
          select financial_app.set_budget_manual_amount(
            '2098-04',${parentCategoryId}::uuid,null::bigint
          ) as result
        `;
        const clearedParent = clearedRows[0]?.result?.categories?.find(
          (row: any) => row.categoryId === parentCategoryId,
        );

        const auditAfterClearRows = await tx`
          select count(*)::int as count
          from financial_app.audit_changes
          where entity_type='budget'
            and entity_id=${manualParent?.id}::uuid
            and field_name='manual_amount_cents'
        `;

        verified =
          snapshot?.contractVersion === 1 &&
          snapshot?.principles?.bankSource === 'read_only' &&
          snapshot?.principles?.actualSource === 'financial_transaction_facts' &&
          snapshot?.principles?.transfersConsumeBudget === false &&
          snapshot?.principles?.confirmedDuplicatesConsumeBudget === false &&
          snapshot?.total?.automaticAmountCents === 20000 &&
          snapshot?.total?.actualExpenseCents === 25000 &&
          snapshot?.total?.status === 'over' &&
          parent?.automaticAmountCents === 20000 &&
          parent?.actualExpenseCents === 25000 &&
          parent?.status === 'over' &&
          parent?.historyMonths?.length === 3 &&
          child?.automaticAmountCents === 20000 &&
          child?.actualExpenseCents === 25000 &&
          refreshedParent?.persisted === true &&
          refreshedChild?.persisted === true &&
          manualParent?.manualAmountCents === 30000 &&
          manualParent?.effectiveAmountCents === 30000 &&
          manualParent?.status === 'on_track' &&
          auditRows[0]?.count === 1 &&
          clearedParent?.manualAmountCents === null &&
          clearedParent?.effectiveAmountCents === 20000 &&
          clearedParent?.status === 'over' &&
          auditAfterClearRows[0]?.count === 2;

        if (!verified) throw new Error("test_budget_projection_failed");
        throw new Error("__ROLLBACK_BUDGET_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_BUDGET_TEST__") throw error;
    }

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.categories where id in (${parentCategoryId}::uuid,${childCategoryId}::uuid)) as categories,
        (select count(*)::int from financial_app.transaction_source_records where source_file_id=${sourceFileId}) as sources,
        (select count(*)::int from financial_app.transactions where source_row_identity like ${sourceFileId + '::%'}) as transactions,
        (select count(*)::int from financial_app.budgets where id=any(${createdBudgetIds}::uuid[])) as budgets,
        (select count(*)::int from financial_app.audit_changes where entity_id=any(${createdBudgetIds}::uuid[])) as audit_changes
    `;
    const residue = residueRows[0] ?? {};
    const clean = ["categories", "sources", "transactions", "budgets", "audit_changes"]
      .every((key) => residue[key] === 0);

    return json({ verified, clean, residue });
  }

  return null;
}
