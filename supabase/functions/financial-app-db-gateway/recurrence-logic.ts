const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;
const STATUSES = new Set(["active", "ignored", "archived"]);
const INTERVAL_UNITS = new Set(["week", "month", "quarter", "year"]);
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

function recurrenceDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "recurrence_not_found") return json({ error: message }, 404);
  if (
    message.startsWith("invalid_recurrence_") ||
    message === "invalid_recurrence_date_range"
  ) {
    return json({ error: message }, 400);
  }
  console.error("recurrence-logic-database", error instanceof Error ? error.name : typeof error);
  return json({ error: "recurrence_internal_error" }, 500);
}

async function recurrenceQuery(run: () => Promise<any>) {
  try {
    const rows = await run();
    return json(rows[0]?.result ?? null);
  } catch (error) {
    return recurrenceDatabaseError(error);
  }
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`invalid_${field}`);
  return value;
}

function requiredUuid(value: unknown, field: string): string {
  const result = nullableUuid(value, field);
  if (!result) throw new Error(`invalid_${field}`);
  return result;
}

function nullableDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(`invalid_${field}`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function textValue(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string") throw new Error(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(`invalid_${field}`);
  return normalized;
}

function integerValue(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function centsValue(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Math.abs(value) > MAX_SAFE_CENTS) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function nonNegativeCents(value: unknown, field: string): number {
  const result = centsValue(value, field);
  if (result < 0) throw new Error(`invalid_${field}`);
  return result;
}

function enumValue(value: unknown, field: string, allowed: Set<string>): string {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(`invalid_${field}`);
  return value;
}

function fingerprint(token: string, counter: number) {
  return `${token}${counter.toString(16).padStart(8, "0")}`.padEnd(64, "b").slice(0, 64);
}

export async function handleRecurrenceLogicAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "recurrence.snapshot") {
    const dateFrom = nullableDate(payload.dateFrom, "recurrence_date_from");
    const dateTo = nullableDate(payload.dateTo, "recurrence_date_to");
    const minOccurrences = payload.minOccurrences === undefined
      ? 3
      : integerValue(payload.minOccurrences, "recurrence_min_occurrences", 3, 24);
    return recurrenceQuery(() => sql`
      select financial_app.recurrence_candidate_snapshot(
        ${dateFrom}::date,${dateTo}::date,${minOccurrences}::integer
      ) as result
    `);
  }

  if (action === "recurrence.save") {
    const id = nullableUuid(payload.id, "recurrence_id");
    const accountId = nullableUuid(payload.accountId, "recurrence_account_id");
    const merchantId = nullableUuid(payload.merchantId, "recurrence_merchant_id");
    const categoryId = nullableUuid(payload.categoryId, "recurrence_category_id");
    const conceptPattern = textValue(payload.conceptPattern, "recurrence_concept");
    const status = enumValue(payload.status, "recurrence_status", STATUSES);
    const intervalUnit = enumValue(payload.intervalUnit, "recurrence_interval_unit", INTERVAL_UNITS);
    const intervalCount = integerValue(payload.intervalCount, "recurrence_interval_count", 1, 365);
    const usualAmountCents = centsValue(payload.usualAmountCents, "recurrence_usual_amount");
    const amountToleranceCents = nonNegativeCents(payload.amountToleranceCents, "recurrence_amount_tolerance");
    const dateToleranceDays = integerValue(payload.dateToleranceDays, "recurrence_date_tolerance", 0, 31);
    const nextEstimatedDate = nullableDate(payload.nextEstimatedDate, "recurrence_next_date");
    const confidence = enumValue(payload.confidence, "recurrence_confidence", CONFIDENCES);
    const occurrenceCount = integerValue(payload.occurrenceCount, "recurrence_occurrence_count", 0, 1000000);
    const lastObservedDate = nullableDate(payload.lastObservedDate, "recurrence_last_observed_date");

    return recurrenceQuery(() => sql`
      select financial_app.save_recurrence(
        ${id}::uuid,
        ${accountId}::uuid,
        ${merchantId}::uuid,
        ${categoryId}::uuid,
        ${conceptPattern},
        ${status},
        ${intervalUnit},
        ${intervalCount}::integer,
        ${usualAmountCents}::bigint,
        ${amountToleranceCents}::bigint,
        ${dateToleranceDays}::integer,
        ${nextEstimatedDate}::date,
        ${confidence},
        ${occurrenceCount}::integer,
        ${lastObservedDate}::date
      ) as result
    `);
  }

  if (action === "recurrence.status") {
    const id = requiredUuid(payload.id, "recurrence_id");
    const status = enumValue(payload.status, "recurrence_status", STATUSES);
    return recurrenceQuery(() => sql`
      select financial_app.set_recurrence_status(${id}::uuid,${status}) as result
    `);
  }

  if (action === "test.recurrence_engine") {
    if (environment !== "preview") return json({ error: "test_recurrence_engine_preview_only" }, 403);

    const token = crypto.randomUUID().slice(0, 8);
    const sourceFileId = `__phase7_recurrence_${token}__`;
    const concept = `PHASE7 MONTHLY ${token}`;
    const normalizedConcept = concept.toLowerCase();
    let sourceCounter = 0;
    let recurrenceId: string | null = null;
    let verified = false;

    try {
      await sql.begin(async (tx: any) => {
        const accountRows = await tx`
          select id from financial_app.accounts
          where lifecycle='active'
          order by sort_order,name,id
          limit 1
        `;
        const accountId = accountRows[0]?.id;
        if (!accountId) throw new Error("test_recurrence_account_unavailable");

        const add = async (date: string, amountCents: number) => {
          sourceCounter += 1;
          const key = `R7-${sourceCounter}`;
          const rowIdentity = `${sourceFileId}::sheet-1::${key}`;
          const sourceRows = await tx`
            insert into financial_app.transaction_source_records(
              source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,
              source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
            ) values (
              ${sourceFileId},'sheet-1',${key},${rowIdentity},${fingerprint(token, sourceCounter)},
              ${{ test: token, key }},${date}::date,${concept},${amountCents},null,${`Phase7 account ${token}`}
            ) returning id
          `;
          const sourceId = sourceRows[0]?.id;
          if (!sourceId) throw new Error("test_recurrence_source_failed");

          await tx`
            insert into financial_app.transactions(
              source_record_id,source_row_identity,account_id,bank_date,concept_normalized,
              category_id,kind,amount_cents,balance_after_cents,review_state,duplicate_state
            ) values (
              ${sourceId}::uuid,${rowIdentity},${accountId}::uuid,${date}::date,${concept},
              null,'expense',${amountCents},null,'confirmed','none'
            )
          `;
        };

        await add('2098-01-15', -10000);
        await add('2098-02-15', -10200);
        await add('2098-03-15', -9800);
        await add('2098-04-15', -10050);

        const snapshotRows = await tx`
          select financial_app.recurrence_candidate_snapshot(
            '2098-01-01'::date,'2098-04-30'::date,3
          ) as result
        `;
        const snapshot = snapshotRows[0]?.result;
        const candidate = snapshot?.candidates?.find(
          (row: any) => row.conceptPattern === normalizedConcept,
        );
        if (!candidate) throw new Error("test_recurrence_candidate_missing");

        const savedRows = await tx`
          select financial_app.save_recurrence(
            null::uuid,
            ${candidate.accountId}::uuid,
            ${candidate.merchantId}::uuid,
            ${candidate.categoryId}::uuid,
            ${candidate.conceptPattern},
            'active',
            ${candidate.intervalUnit},
            ${candidate.intervalCount}::integer,
            ${candidate.usualAmountCents}::bigint,
            ${candidate.amountToleranceCents}::bigint,
            ${candidate.dateToleranceDays}::integer,
            ${candidate.nextEstimatedDate}::date,
            ${candidate.confidence},
            ${candidate.occurrenceCount}::integer,
            ${candidate.lastObservedDate}::date
          ) as result
        `;
        const saved = savedRows[0]?.result;
        recurrenceId = saved?.id ?? null;
        if (!recurrenceId) throw new Error("test_recurrence_save_failed");

        const ignoredRows = await tx`
          select financial_app.set_recurrence_status(${recurrenceId}::uuid,'ignored') as result
        `;
        const archivedRows = await tx`
          select financial_app.set_recurrence_status(${recurrenceId}::uuid,'archived') as result
        `;
        const auditRows = await tx`
          select count(*)::int as count
          from financial_app.audit_changes
          where entity_type='recurrence' and entity_id=${recurrenceId}::uuid
        `;

        verified =
          snapshot?.contractVersion === 1 &&
          snapshot?.principles?.bankSource === 'read_only' &&
          snapshot?.principles?.factSource === 'financial_transaction_facts' &&
          snapshot?.principles?.automaticPersistence === false &&
          candidate.intervalUnit === 'month' &&
          candidate.intervalCount === 1 &&
          candidate.occurrenceCount === 4 &&
          candidate.confidence === 'medium' &&
          candidate.nextEstimatedDate === '2098-05-15' &&
          saved.status === 'active' &&
          ignoredRows[0]?.result?.status === 'ignored' &&
          archivedRows[0]?.result?.status === 'archived' &&
          auditRows[0]?.count === 3;

        if (!verified) throw new Error("test_recurrence_projection_failed");
        throw new Error("__ROLLBACK_RECURRENCE_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_RECURRENCE_TEST__") throw error;
    }

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.transaction_source_records where source_file_id=${sourceFileId}) as sources,
        (select count(*)::int from financial_app.transactions where source_row_identity like ${sourceFileId + '::%'}) as transactions,
        (select count(*)::int from financial_app.recurrences where id=${recurrenceId}::uuid) as recurrences,
        (select count(*)::int from financial_app.audit_changes where entity_id=${recurrenceId}::uuid) as audit_changes
    `;
    const residue = residueRows[0] ?? {};
    const clean = ["sources", "transactions", "recurrences", "audit_changes"]
      .every((key) => residue[key] === 0);

    return json({ verified, clean, residue });
  }

  return null;
}
