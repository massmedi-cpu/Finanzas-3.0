const ACCOUNT_TYPES = new Set(["checking", "savings", "credit", "cash", "investment", "other"]);
const TRANSACTION_KINDS = new Set(["income", "expense", "transfer", "refund", "adjustment"]);
const REVIEW_STATES = new Set(["confirmed", "pending", "needs_review"]);
const ISSUE_SEVERITIES = new Set(["warning", "error"]);
const SHA256 = /^[0-9a-f]{64}$/;

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

function text(value: unknown, field: string, allowEmpty = false): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`invalid_${field}`);
}

function safeInteger(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`invalid_${field}`);
}

function nullableText(value: unknown, field: string): asserts value is string | null {
  if (value !== null && typeof value !== "string") throw new Error(`invalid_${field}`);
}

function object(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`invalid_${field}`);
}

function validateAccount(account: any, sourceFileId: string) {
  object(account, "source_account");
  if (account.sourceFileId !== sourceFileId) throw new Error("source_account_file_mismatch");
  text(account.accountExternalKey, "account_external_key");
  text(account.accountName, "account_name");
  text(account.institution, "institution");
  text(account.sourceIdentifier, "source_identifier");
  if (!ACCOUNT_TYPES.has(account.accountType)) throw new Error("invalid_source_account_type");
  safeInteger(account.openingBalanceCents, "opening_balance");
}

function validateObservation(observation: any, sourceFileId: string) {
  object(observation, "source_observation");
  text(observation.sourceSheetId, "source_sheet_id");
  text(observation.sourceRowKey, "source_row_key");
  text(observation.sourceRowIdentity, "source_row_identity");
  text(observation.sourceFingerprint, "source_fingerprint");
  if (!SHA256.test(observation.sourceFingerprint)) throw new Error("invalid_source_fingerprint");
  object(observation.sourcePayload, "source_payload");
  text(observation.bankDate, "bank_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.bankDate)) throw new Error("invalid_bank_date");
  text(observation.conceptOriginal, "concept_original");
  text(observation.conceptNormalized, "concept_normalized");
  safeInteger(observation.amountCents, "amount_cents");
  if (observation.balanceAfterCents !== null) safeInteger(observation.balanceAfterCents, "balance_after_cents");
  text(observation.accountExternalKey, "account_external_key");
  if (!TRANSACTION_KINDS.has(observation.transactionKind)) throw new Error("invalid_transaction_kind");
  if (!REVIEW_STATES.has(observation.reviewState)) throw new Error("invalid_review_state");
  const expectedIdentity = `${sourceFileId.trim()}::${observation.sourceSheetId.trim()}::${observation.sourceRowKey.trim()}`;
  if (observation.sourceRowIdentity !== expectedIdentity) throw new Error("source_row_identity_mismatch");
}

function validateBatch(batch: any) {
  object(batch, "source_batch");
  text(batch.sourceFileId, "source_file_id");
  nullableText(batch.sourceRevision, "source_revision");
  text(batch.schemaFingerprint, "schema_fingerprint");
  if (!SHA256.test(batch.schemaFingerprint)) throw new Error("invalid_schema_fingerprint");
  if (!Array.isArray(batch.accounts) || batch.accounts.length === 0 || batch.accounts.length > 20) {
    throw new Error("invalid_source_accounts");
  }
  if (!Array.isArray(batch.observations) || batch.observations.length === 0 || batch.observations.length > 10000) {
    throw new Error("invalid_source_observations");
  }
  for (const account of batch.accounts) validateAccount(account, batch.sourceFileId);
  const identities = new Set<string>();
  for (const observation of batch.observations) {
    validateObservation(observation, batch.sourceFileId);
    if (identities.has(observation.sourceRowIdentity)) throw new Error("duplicate_source_row_identity");
    identities.add(observation.sourceRowIdentity);
  }
}

function validateFailure(failure: any) {
  object(failure, "source_failure");
  text(failure.sourceFileId, "source_file_id");
  nullableText(failure.sourceRevision, "source_revision");
  if (!ISSUE_SEVERITIES.has(failure.severity)) throw new Error("invalid_issue_severity");
  text(failure.issueCode, "issue_code");
  nullableText(failure.sourceSheetId, "source_sheet_id");
  nullableText(failure.sourceRowKey, "source_row_key");
  nullableText(failure.fieldName, "field_name");
  text(failure.message, "issue_message");
  if (failure.details !== null) object(failure.details, "issue_details");
}

async function findMissingSourceRows(
  sql: any,
  sourceFileId: string,
  presentRowIdentities: string[],
) {
  return sql`
    select
      t.id as transaction_id,
      sr.source_sheet_id,
      sr.source_row_key,
      t.source_row_identity
    from financial_app.transactions t
    join financial_app.transaction_source_records sr on sr.id=t.source_record_id
    where sr.source_file_id=${sourceFileId}
      and not (t.source_row_identity = any(${presentRowIdentities}::text[]))
    order by sr.source_sheet_id,sr.source_row_key,t.id
  `;
}

export async function handleSourceSyncAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "source.record_failure") {
    validateFailure(payload.failure);
    const failure = payload.failure;
    const runRows = await sql`
      insert into financial_app.sync_runs (
        source_file_id,source_revision,status,finished_at,rows_seen,rows_failed,error_code,error_message
      ) values (
        ${failure.sourceFileId},${failure.sourceRevision},'failed',now(),0,0,${failure.issueCode},${failure.message}
      ) returning id
    `;
    const syncRunId = runRows[0]?.id;
    await sql`
      insert into financial_app.sync_issues (
        sync_run_id,severity,issue_code,source_sheet_id,source_row_key,field_name,message,details
      ) values (
        ${syncRunId}::uuid,${failure.severity},${failure.issueCode},${failure.sourceSheetId},
        ${failure.sourceRowKey},${failure.fieldName},${failure.message},${failure.details}
      )
    `;
    return json({ syncRunId });
  }

  if (action === "source.sync_batch") {
    validateBatch(payload.batch);
    const batch = payload.batch;
    let result: Record<string, unknown> | null = null;

    try {
      await sql.begin(async (tx: any) => {
        const runRows = await tx`
          insert into financial_app.sync_runs (
            source_file_id,source_revision,status,rows_seen,schema_fingerprint
          ) values (
            ${batch.sourceFileId},${batch.sourceRevision},'started',${batch.observations.length},${batch.schemaFingerprint}
          ) returning id
        `;
        const syncRunId = runRows[0]?.id;

        for (const account of batch.accounts) {
          await tx`
            select financial_app.ensure_source_account_mapping(
              ${account.sourceFileId},${account.accountExternalKey},${account.accountName},${account.institution},
              ${account.accountType},${account.openingBalanceCents},${account.sourceIdentifier}
            )
          `;
        }

        let rowsInserted = 0;
        let rowsRevised = 0;
        let rowsSkipped = 0;
        const touchedTransactionIds: string[] = [];

        for (const observation of batch.observations) {
          const rows = await tx`
            select * from financial_app.ingest_source_observation(
              ${batch.sourceFileId},${observation.sourceSheetId},${observation.sourceRowKey},
              ${observation.sourceRowIdentity},${observation.sourceFingerprint},${observation.sourcePayload},
              ${observation.bankDate}::date,${observation.conceptOriginal},${observation.conceptNormalized},
              ${observation.amountCents},${observation.balanceAfterCents},${observation.accountExternalKey},
              ${observation.transactionKind},${observation.reviewState},now()
            )
          `;
          const row = rows[0];
          if (!row?.transaction_id) throw new Error("source_ingestion_missing_transaction");
          touchedTransactionIds.push(row.transaction_id);
          if (row.action === "insert") rowsInserted += 1;
          else if (row.action === "append_revision") rowsRevised += 1;
          else if (row.action === "skip") rowsSkipped += 1;
          else throw new Error("source_ingestion_unknown_action");
        }

        const duplicateRows = touchedTransactionIds.length
          ? await tx`
              select count(*)::int as count
              from financial_app.transactions
              where id = any(${touchedTransactionIds}::uuid[])
                and duplicate_state='suspected'
            `
          : [{ count: 0 }];
        const duplicatesDetected = duplicateRows[0]?.count ?? 0;

        const presentRowIdentities = batch.observations.map((observation: any) => observation.sourceRowIdentity);
        const missingRows = await findMissingSourceRows(tx, batch.sourceFileId, presentRowIdentities);
        for (const missing of missingRows) {
          await tx`
            insert into financial_app.sync_issues (
              sync_run_id,severity,issue_code,source_sheet_id,source_row_key,field_name,message,details
            ) values (
              ${syncRunId}::uuid,'warning','source_row_missing_from_snapshot',${missing.source_sheet_id},
              ${missing.source_row_key},null,'Una fila importada anteriormente ya no aparece en la fotografía completa de la fuente oficial.',
              ${JSON.stringify({
                transactionId: missing.transaction_id,
                sourceRowIdentity: missing.source_row_identity,
                sourceRevision: batch.sourceRevision,
              })}::jsonb
            )
          `;
        }
        const warningsCount = missingRows.length;

        await tx`
          update financial_app.sync_runs
          set status='success',finished_at=now(),rows_inserted=${rowsInserted},rows_revised=${rowsRevised},
              rows_skipped=${rowsSkipped},rows_failed=0,duplicates_detected=${duplicatesDetected},warnings_count=${warningsCount},
              error_code=null,error_message=null
          where id=${syncRunId}::uuid
        `;

        const lastRowBySheet = new Map<string, string>();
        for (const observation of batch.observations) {
          lastRowBySheet.set(observation.sourceSheetId, observation.sourceRowKey);
        }

        for (const [sourceSheetId, lastSourceRowKey] of lastRowBySheet) {
          await tx`
            insert into financial_app.sync_cursors (
              source_file_id,source_sheet_id,source_revision,last_source_row_key,last_successful_run_id,updated_at
            ) values (
              ${batch.sourceFileId},${sourceSheetId},${batch.sourceRevision},${lastSourceRowKey},${syncRunId}::uuid,now()
            )
            on conflict (source_file_id,source_sheet_id) do update set
              source_revision=excluded.source_revision,
              last_source_row_key=excluded.last_source_row_key,
              last_successful_run_id=excluded.last_successful_run_id,
              updated_at=now()
          `;
        }

        result = {
          syncRunId,
          status: "success",
          rowsSeen: batch.observations.length,
          rowsInserted,
          rowsRevised,
          rowsSkipped,
          rowsMissing: missingRows.length,
          duplicatesDetected,
          warningsCount,
          cursorsAdvanced: lastRowBySheet.size,
        };
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "source_sync_failed";
      const failedRows = batch.observations.length;
      const failed = await sql`
        insert into financial_app.sync_runs (
          source_file_id,source_revision,status,finished_at,rows_seen,rows_failed,schema_fingerprint,error_code,error_message
        ) values (
          ${batch.sourceFileId},${batch.sourceRevision},'failed',now(),${failedRows},${failedRows},${batch.schemaFingerprint},
          ${code},'El batch atómico se ha revertido por completo.'
        ) returning id
      `;
      const syncRunId = failed[0]?.id;
      await sql`
        insert into financial_app.sync_issues (
          sync_run_id,severity,issue_code,message,details
        ) values (
          ${syncRunId}::uuid,'error',${code},'El batch atómico se ha revertido por completo.',
          ${JSON.stringify({ rows: failedRows })}::jsonb
        )
      `;
      return json({ error: "source_sync_failed", syncRunId }, 400);
    }

    return json(result);
  }

  if (action === "source.status") {
    text(payload.sourceFileId, "source_file_id");
    const rows = await sql`
      select id,source_file_id,source_revision,status,started_at,finished_at,rows_seen,rows_inserted,
             rows_revised,rows_skipped,rows_failed,duplicates_detected,warnings_count,schema_fingerprint,
             error_code,error_message
      from financial_app.sync_runs
      where source_file_id=${payload.sourceFileId}
      order by started_at desc,id desc
      limit 1
    `;
    const cursors = await sql`
      select source_file_id,source_sheet_id,source_revision,last_source_row_key,last_successful_run_id,updated_at
      from financial_app.sync_cursors
      where source_file_id=${payload.sourceFileId}
      order by source_sheet_id
    `;
    return json({ run: rows[0] ?? null, cursors });
  }

  if (action === "test.source_ingestion") {
    if (environment !== "preview") return json({ error: "test_source_ingestion_preview_only" }, 403);
    let verified = false;
    try {
      await sql.begin(async (tx: any) => {
        const accountRows = await tx`
          select financial_app.ensure_source_account_mapping(
            '__phase2_gateway_test__','Cuenta prueba gateway','Cuenta prueba gateway','Banco prueba','checking',0,'****0001'
          ) as id
        `;
        if (!accountRows[0]?.id) throw new Error("test_account_mapping_failed");

        const first = await tx`
          select * from financial_app.ingest_source_observation(
            '__phase2_gateway_test__','sheet-1','ROW-1','__phase2_gateway_test__::sheet-1::ROW-1',${"a".repeat(64)},
            ${JSON.stringify({ id: "ROW-1" })}::jsonb,'2026-09-01'::date,'TEST','TEST',-100,900,
            'Cuenta prueba gateway','expense','pending',now()
          )
        `;
        const repeated = await tx`
          select * from financial_app.ingest_source_observation(
            '__phase2_gateway_test__','sheet-1','ROW-1','__phase2_gateway_test__::sheet-1::ROW-1',${"a".repeat(64)},
            ${JSON.stringify({ id: "ROW-1" })}::jsonb,'2026-09-01'::date,'TEST','TEST',-100,900,
            'Cuenta prueba gateway','expense','pending',now()
          )
        `;
        if (first[0]?.action !== 'insert' || repeated[0]?.action !== 'skip') {
          throw new Error("test_source_idempotency_failed");
        }

        const duplicateA = await tx`
          select * from financial_app.ingest_source_observation(
            '__phase2_gateway_test__','sheet-1','DUP-A','__phase2_gateway_test__::sheet-1::DUP-A',${"b".repeat(64)},
            ${JSON.stringify({ id: "DUP-A" })}::jsonb,'2026-09-02'::date,'DUPLICADO','DUPLICADO',-500,400,
            'Cuenta prueba gateway','expense','pending',now()
          )
        `;
        const duplicateB = await tx`
          select * from financial_app.ingest_source_observation(
            '__phase2_gateway_test__','sheet-1','DUP-B','__phase2_gateway_test__::sheet-1::DUP-B',${"c".repeat(64)},
            ${JSON.stringify({ id: "DUP-B" })}::jsonb,'2026-09-02'::date,'DUPLICADO','DUPLICADO',-500,-100,
            'Cuenta prueba gateway','expense','pending',now()
          )
        `;
        const suspected = await tx`
          select count(*)::int as count
          from financial_app.transactions
          where id = any(${[duplicateA[0]?.transaction_id, duplicateB[0]?.transaction_id]}::uuid[])
            and duplicate_state='suspected'
        `;
        if (suspected[0]?.count !== 2) throw new Error("test_duplicate_suspicion_failed");

        await tx`
          select * from financial_app.ingest_source_observation(
            '__phase2_gateway_test__','sheet-1','DUP-A','__phase2_gateway_test__::sheet-1::DUP-A',${"d".repeat(64)},
            ${JSON.stringify({ id: "DUP-A", corrected: true })}::jsonb,'2026-09-02'::date,'CORREGIDO','CORREGIDO',-600,300,
            'Cuenta prueba gateway','expense','needs_review',now()
          )
        `;
        const cleared = await tx`
          select count(*)::int as count
          from financial_app.transactions
          where id = any(${[duplicateA[0]?.transaction_id, duplicateB[0]?.transaction_id]}::uuid[])
            and duplicate_state='none'
        `;
        if (cleared[0]?.count !== 2) throw new Error("test_duplicate_recomputation_failed");

        const rowIdentity = '__phase2_gateway_test__::sheet-1::ROW-1';
        const missing = await findMissingSourceRows(tx, '__phase2_gateway_test__', [
          '__phase2_gateway_test__::sheet-1::DUP-A',
          '__phase2_gateway_test__::sheet-1::DUP-B',
        ]);
        if (!missing.some((row: any) => row.source_row_identity === rowIdentity)) {
          throw new Error("test_missing_source_row_detection_failed");
        }
        const present = await findMissingSourceRows(tx, '__phase2_gateway_test__', [
          rowIdentity,
          '__phase2_gateway_test__::sheet-1::DUP-A',
          '__phase2_gateway_test__::sheet-1::DUP-B',
        ]);
        if (present.some((row: any) => row.source_row_identity === rowIdentity)) {
          throw new Error("test_present_source_row_flagged_missing");
        }

        await tx`
          insert into financial_app.sync_cursors (
            source_file_id,source_sheet_id,source_revision,last_source_row_key,updated_at
          ) values
            ('__phase2_gateway_test__','sheet-1','rev-test','ROW-1',now()),
            ('__phase2_gateway_test__','sheet-2','rev-test','ROW-9',now())
        `;
        const cursorRows = await tx`
          select count(*)::int as count
          from financial_app.sync_cursors
          where source_file_id='__phase2_gateway_test__'
        `;
        if (cursorRows[0]?.count !== 2) throw new Error("test_sheet_cursor_isolation_failed");

        verified = true;
        throw new Error("__ROLLBACK_SOURCE_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_SOURCE_TEST__") throw error;
    }
    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.accounts where name='Cuenta prueba gateway') as accounts,
        (select count(*)::int from financial_app.account_source_mappings where source_file_id='__phase2_gateway_test__') as mappings,
        (select count(*)::int from financial_app.transaction_source_records where source_file_id='__phase2_gateway_test__') as sources,
        (select count(*)::int from financial_app.transactions where source_row_identity like '__phase2_gateway_test__::%') as transactions,
        (select count(*)::int from financial_app.sync_cursors where source_file_id='__phase2_gateway_test__') as cursors
    `;
    const residue = residueRows[0];
    return json({
      verified,
      clean:
        residue?.accounts === 0 &&
        residue?.mappings === 0 &&
        residue?.sources === 0 &&
        residue?.transactions === 0 &&
        residue?.cursors === 0,
      residue,
    });
  }

  return null;
}