const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONFIDENCES = new Set(["high", "medium", "low"]);

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

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    message === "forecast_item_not_found" ||
    message === "forecast_account_not_found" ||
    message === "forecast_category_not_found" ||
    message === "forecast_merchant_not_found" ||
    message === "forecast_transaction_not_found"
  ) {
    return json({ error: message }, 404);
  }
  if (
    message === "forecast_transaction_already_reconciled" ||
    message === "forecast_reconciliation_transaction_ineligible" ||
    message === "forecast_reconciliation_transfer_not_allowed" ||
    message === "forecast_reconciliation_account_mismatch" ||
    message === "forecast_reconciliation_sign_mismatch"
  ) {
    return json({ error: message }, 409);
  }
  if (
    message.startsWith("invalid_forecast_") ||
    message === "forecast_date_range_too_large" ||
    message === "forecast_exclusion_reason_required"
  ) {
    return json({ error: message }, 400);
  }
  console.error("forecast-logic-database", error instanceof Error ? error.name : typeof error);
  return json({ error: "forecast_internal_error" }, 500);
}

async function forecastQuery(run: () => Promise<any>) {
  try {
    const rows = await run();
    return json(rows[0]?.result ?? null);
  } catch (error) {
    return databaseError(error);
  }
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`invalid_${field}`);
  return value;
}

function requiredUuid(value: unknown, field: string): string {
  const result = nullableUuid(value, field);
  if (!result) throw new Error(`invalid_${field}`);
  return result;
}

function requiredDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(`invalid_${field}`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function safeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`invalid_${field}`);
  return value;
}

function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  const result = safeInteger(value, field);
  if (result < min || result > max) throw new Error(`invalid_${field}`);
  return result;
}

function textValue(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`invalid_${field}`);
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > max) throw new Error(`invalid_${field}`);
  return result;
}

function confidenceValue(value: unknown): string {
  if (typeof value !== "string" || !CONFIDENCES.has(value)) {
    throw new Error("invalid_forecast_confidence");
  }
  return value;
}

export async function handleForecastLogicAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "forecast.snapshot") {
    const dateFrom = requiredDate(payload.dateFrom, "forecast_date_from");
    const dateTo = requiredDate(payload.dateTo, "forecast_date_to");
    const accountId = nullableUuid(payload.accountId, "forecast_account_id");
    return forecastQuery(() => sql`
      select financial_app.forecast_snapshot(
        ${dateFrom}::date,${dateTo}::date,${accountId}::uuid
      ) as result
    `);
  }

  if (action === "forecast.refresh") {
    const dateFrom = requiredDate(payload.dateFrom, "forecast_date_from");
    const dateTo = requiredDate(payload.dateTo, "forecast_date_to");
    const accountId = nullableUuid(payload.accountId, "forecast_account_id");
    return forecastQuery(() => sql`
      select financial_app.refresh_recurring_forecast(
        ${dateFrom}::date,${dateTo}::date,${accountId}::uuid
      ) as result
    `);
  }

  if (action === "forecast.manual") {
    const date = requiredDate(payload.date, "forecast_date");
    const concept = textValue(payload.concept, "forecast_concept", 240);
    const amountCents = safeInteger(payload.amountCents, "forecast_amount");
    const accountId = nullableUuid(payload.accountId, "forecast_account_id");
    const categoryId = nullableUuid(payload.categoryId, "forecast_category_id");
    const merchantId = nullableUuid(payload.merchantId, "forecast_merchant_id");
    const confidence = confidenceValue(payload.confidence ?? "high");
    return forecastQuery(() => sql`
      select financial_app.save_manual_forecast_item(
        ${date}::date,${concept},${amountCents}::bigint,
        ${accountId}::uuid,${categoryId}::uuid,${merchantId}::uuid,${confidence}
      ) as result
    `);
  }

  if (action === "forecast.exclude") {
    const id = requiredUuid(payload.id, "forecast_item_id");
    if (typeof payload.excluded !== "boolean") throw new Error("invalid_forecast_excluded");
    const reason = textValue(payload.reason ?? "", "forecast_excluded_reason", 500, !payload.excluded);
    return forecastQuery(() => sql`
      select financial_app.set_forecast_item_excluded(
        ${id}::uuid,${payload.excluded}::boolean,${reason}
      ) as result
    `);
  }

  if (action === "forecast.candidates") {
    const id = requiredUuid(payload.id, "forecast_item_id");
    const days = payload.days === undefined ? 7 : boundedInteger(payload.days, "forecast_candidate_days", 0, 31);
    const limit = payload.limit === undefined ? 8 : boundedInteger(payload.limit, "forecast_candidate_limit", 1, 20);
    return forecastQuery(() => sql`
      select financial_app.forecast_reconciliation_candidates(
        ${id}::uuid,${days}::integer,${limit}::integer
      ) as result
    `);
  }

  if (action === "forecast.reconcile") {
    const id = requiredUuid(payload.id, "forecast_item_id");
    const transactionId = nullableUuid(payload.transactionId, "forecast_transaction_id");
    const note = textValue(payload.note ?? "", "forecast_reconciliation_note", 500, true);
    return forecastQuery(() => sql`
      select financial_app.reconcile_forecast_item(
        ${id}::uuid,${transactionId}::uuid,${note}
      ) as result
    `);
  }

  if (action === "test.forecast_engine") {
    if (environment !== "preview") return json({ error: "test_forecast_engine_preview_only" }, 403);

    let manualId: string | null = null;
    let recurrenceId: string | null = null;
    let verified = false;

    try {
      await sql.begin(async (tx: any) => {
        const txRows = await tx`
          select f.transaction_id,f.bank_date,f.amount_cents,f.account_id
          from financial_app.financial_transaction_facts() f
          join financial_app.accounts a on a.id=f.account_id
          where f.analytics_eligible=true
            and f.effective_kind='expense'
            and f.amount_cents < 0
            and a.lifecycle='active'
          order by f.bank_date desc,f.transaction_id
          limit 1
        `;
        const actual = txRows[0];
        if (!actual?.transaction_id || !actual?.account_id) {
          throw new Error("test_forecast_transaction_unavailable");
        }

        const manualRows = await tx`
          select financial_app.save_manual_forecast_item(
            ${actual.bank_date}::date,'PHASE8 PREVIEW ROLLBACK',${actual.amount_cents}::bigint,
            ${actual.account_id}::uuid,null,null,'high'
          ) as result
        `;
        const manual = manualRows[0]?.result;
        manualId = manual?.id ?? null;
        if (!manualId) throw new Error("test_forecast_manual_failed");

        const candidateRows = await tx`
          select financial_app.forecast_reconciliation_candidates(
            ${manualId}::uuid,7,8
          ) as result
        `;
        const candidates = candidateRows[0]?.result;
        const candidate = candidates?.candidates?.find(
          (row: any) => row.transactionId === actual.transaction_id,
        );
        if (!candidate) throw new Error("test_forecast_candidate_failed");

        const excludedRows = await tx`
          select financial_app.set_forecast_item_excluded(
            ${manualId}::uuid,true,'Preview rollback'
          ) as result
        `;
        const restoredRows = await tx`
          select financial_app.set_forecast_item_excluded(
            ${manualId}::uuid,false,''
          ) as result
        `;
        const reconciledRows = await tx`
          select financial_app.reconcile_forecast_item(
            ${manualId}::uuid,${actual.transaction_id}::uuid,'Preview rollback'
          ) as result
        `;
        const unreconciledRows = await tx`
          select financial_app.reconcile_forecast_item(
            ${manualId}::uuid,null,''
          ) as result
        `;

        const recurrenceRows = await tx`
          insert into financial_app.recurrences(
            account_id,concept_pattern,status,interval_unit,interval_count,
            usual_amount_cents,amount_tolerance_cents,next_estimated_date,
            confidence,occurrence_count,date_tolerance_days,last_observed_date,last_recalculated_at
          ) values (
            ${actual.account_id}::uuid,'phase8 preview recurring rollback','active','month',1,
            -20000,0,'2099-01-15','high',4,3,'2098-12-15',now()
          ) returning id
        `;
        recurrenceId = recurrenceRows[0]?.id ?? null;
        if (!recurrenceId) throw new Error("test_forecast_recurrence_failed");

        const refreshRows = await tx`
          select financial_app.refresh_recurring_forecast(
            '2099-01-01'::date,'2099-03-31'::date,${actual.account_id}::uuid
          ) as result
        `;
        const snapshotRows = await tx`
          select financial_app.forecast_snapshot(
            '2099-01-01'::date,'2099-03-31'::date,null
          ) as result
        `;
        const auditRows = await tx`
          select count(*)::int as count
          from financial_app.audit_changes
          where entity_type='forecast' and entity_id=${manualId}::uuid
        `;
        const generatedRows = await tx`
          select count(*)::int as count
          from financial_app.forecast_items
          where recurrence_id=${recurrenceId}::uuid
            and date between '2099-01-01' and '2099-03-31'
        `;

        const snapshot = snapshotRows[0]?.result;
        verified =
          manual?.origin === 'manual' &&
          candidates?.principles?.bankSource === 'read_only' &&
          candidate.transactionId === actual.transaction_id &&
          excludedRows[0]?.result?.excluded === true &&
          restoredRows[0]?.result?.excluded === false &&
          reconciledRows[0]?.result?.confirmed_transaction_id === actual.transaction_id &&
          unreconciledRows[0]?.result?.confirmed_transaction_id === null &&
          refreshRows[0]?.result?.generated === 3 &&
          generatedRows[0]?.count === 3 &&
          snapshot?.contractVersion === 1 &&
          snapshot?.principles?.bankSource === 'read_only' &&
          snapshot?.principles?.getHasSideEffects === false &&
          snapshot?.summary?.plannedItems >= 3 &&
          auditRows[0]?.count === 5;

        if (!verified) throw new Error("test_forecast_projection_failed");
        throw new Error("__ROLLBACK_FORECAST_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_FORECAST_TEST__") throw error;
    }

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.forecast_items where id=${manualId}::uuid) as manual_items,
        (select count(*)::int from financial_app.forecast_items where recurrence_id=${recurrenceId}::uuid) as recurring_items,
        (select count(*)::int from financial_app.recurrences where id=${recurrenceId}::uuid) as recurrences,
        (select count(*)::int from financial_app.audit_changes where entity_type='forecast' and entity_id=${manualId}::uuid) as audit_changes
    `;
    const residue = residueRows[0] ?? {};
    const clean = ["manual_items", "recurring_items", "recurrences", "audit_changes"]
      .every((key) => residue[key] === 0);

    return json({ verified, clean, residue, serverReconciliationCandidates: true });
  }

  return null;
}
