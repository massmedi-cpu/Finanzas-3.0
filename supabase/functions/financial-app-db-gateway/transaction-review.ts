const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DUPLICATE_DECISIONS = new Set(["confirmed", "dismissed"]);

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

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`invalid_${field}`);
  return value;
}

function dayWindow(value: unknown) {
  if (value === undefined || value === null) return 3;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 7) {
    throw new Error("invalid_transfer_day_window");
  }
  return value;
}

export async function handleTransactionReviewAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "transaction.duplicate_group") {
    const transactionId = uuid(payload.transactionId, "transaction_id");
    const rows = await sql`
      select id,account_id,account_name,bank_date,concept_normalized,amount_cents,duplicate_state,decision,review_current
      from financial_app.list_duplicate_group(${transactionId}::uuid)
    `;
    return json({ rows });
  }

  if (action === "transaction.duplicate_review") {
    const transactionId = uuid(payload.transactionId, "transaction_id");
    if (typeof payload.decision !== "string" || !DUPLICATE_DECISIONS.has(payload.decision)) {
      throw new Error("invalid_duplicate_review_decision");
    }
    const rows = await sql`
      select financial_app.review_duplicate(${transactionId}::uuid,${payload.decision}) as result
    `;
    return json({ result: rows[0]?.result ?? null });
  }

  if (action === "transaction.transfer_candidates") {
    const transactionId = uuid(payload.transactionId, "transaction_id");
    const window = dayWindow(payload.dayWindow);
    const rows = await sql`
      select id,account_id,account_name,bank_date,concept_normalized,amount_cents,transfer_pair_id,day_gap
      from financial_app.list_transfer_candidates(${transactionId}::uuid,${window})
    `;
    return json({ rows, dayWindow: window });
  }

  if (action === "transaction.transfer_pair") {
    const transactionId = uuid(payload.transactionId, "transaction_id");
    const pairId = uuid(payload.pairId, "pair_id");
    const rows = await sql`
      select financial_app.pair_internal_transfer(${transactionId}::uuid,${pairId}::uuid) as result
    `;
    return json({ result: rows[0]?.result ?? null });
  }

  if (action === "transaction.transfer_unpair") {
    const transactionId = uuid(payload.transactionId, "transaction_id");
    const rows = await sql`
      select financial_app.unpair_internal_transfer(${transactionId}::uuid) as result
    `;
    return json({ result: rows[0]?.result ?? null });
  }

  if (action === "test.transaction_review_engine") {
    if (environment !== "preview") {
      return json({ error: "test_transaction_review_engine_preview_only" }, 403);
    }

    const token = crypto.randomUUID().slice(0, 8);
    const sourceFileId = `__phase4_review_${token}__`;
    const createdTransactionIds: string[] = [];
    let verified = false;

    try {
      await sql.begin(async (tx: any) => {
        const accountA = await tx`
          insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
          values (${'Phase4 review account A ' + token},'Banco prueba','checking',0,'EUR','active',0)
          returning id
        `;
        const accountB = await tx`
          insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
          values (${'Phase4 review account B ' + token},'Banco prueba','savings',0,'EUR','active',1)
          returning id
        `;
        const accountAId = accountA[0]?.id;
        const accountBId = accountB[0]?.id;
        if (!accountAId || !accountBId) throw new Error("test_transaction_review_accounts_failed");

        const sourceIds: string[] = [];
        for (let index = 1; index <= 4; index += 1) {
          const fingerprint = `${index.toString(16).repeat(56)}${token}`.slice(0, 64);
          const rowKey = `ROW-${index}`;
          const source = await tx`
            insert into financial_app.transaction_source_records(
              source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
              bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
            ) values (
              ${sourceFileId},'sheet-1',${rowKey},${sourceFileId + '::sheet-1::' + rowKey},${fingerprint},
              ${{ test: token, row: index }},
              ${index <= 2 ? '2026-09-05' : index === 3 ? '2026-09-04' : '2026-09-05'}::date,
              ${index <= 2 ? 'DUPLICADO PRUEBA ' + token : 'TRANSFERENCIA PRUEBA ' + token},
              ${index <= 2 ? -1234 : index === 3 ? -25000 : 25000},
              ${50000 - index * 1000},
              ${index === 4 ? 'Phase4 review account B ' + token : 'Phase4 review account A ' + token}
            ) returning id
          `;
          if (!source[0]?.id) throw new Error("test_transaction_review_source_failed");
          sourceIds.push(source[0].id);
        }

        const duplicateA = await tx`
          insert into financial_app.transactions(
            source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
          ) values (
            ${sourceIds[0]}::uuid,${sourceFileId + '::sheet-1::ROW-1'},${accountAId}::uuid,'2026-09-05'::date,
            ${'DUPLICADO PRUEBA ' + token},'expense',-1234,49000,'pending','none'
          ) returning id
        `;
        const duplicateB = await tx`
          insert into financial_app.transactions(
            source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
          ) values (
            ${sourceIds[1]}::uuid,${sourceFileId + '::sheet-1::ROW-2'},${accountAId}::uuid,'2026-09-05'::date,
            ${'DUPLICADO PRUEBA ' + token},'expense',-1234,48000,'pending','none'
          ) returning id
        `;
        const transferA = await tx`
          insert into financial_app.transactions(
            source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
          ) values (
            ${sourceIds[2]}::uuid,${sourceFileId + '::sheet-1::ROW-3'},${accountAId}::uuid,'2026-09-04'::date,
            ${'TRANSFERENCIA PRUEBA ' + token},'transfer',-25000,47000,'confirmed','none'
          ) returning id
        `;
        const transferB = await tx`
          insert into financial_app.transactions(
            source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
          ) values (
            ${sourceIds[3]}::uuid,${sourceFileId + '::sheet-1::ROW-4'},${accountBId}::uuid,'2026-09-05'::date,
            ${'TRANSFERENCIA PRUEBA ' + token},'transfer',25000,46000,'confirmed','none'
          ) returning id
        `;

        const duplicateAId = duplicateA[0]?.id;
        const duplicateBId = duplicateB[0]?.id;
        const transferAId = transferA[0]?.id;
        const transferBId = transferB[0]?.id;
        if (!duplicateAId || !duplicateBId || !transferAId || !transferBId) {
          throw new Error("test_transaction_review_transactions_failed");
        }
        createdTransactionIds.push(duplicateAId, duplicateBId, transferAId, transferBId);

        await tx`select financial_app.refresh_duplicate_candidates(${duplicateAId}::uuid)`;
        const duplicateGroup = await tx`
          select id,duplicate_state from financial_app.list_duplicate_group(${duplicateAId}::uuid)
        `;
        if (duplicateGroup.length !== 2 || duplicateGroup.some((row: any) => row.duplicate_state !== "suspected")) {
          throw new Error("test_transaction_review_duplicate_detection_failed");
        }

        const confirmed = await tx`
          select financial_app.review_duplicate(${duplicateAId}::uuid,'confirmed') as result
        `;
        if (confirmed[0]?.result?.duplicateState !== "confirmed") {
          throw new Error("test_transaction_review_confirm_failed");
        }

        await tx`select financial_app.review_duplicate(${duplicateAId}::uuid,'dismissed')`;
        await tx`select financial_app.refresh_duplicate_candidates(${duplicateAId}::uuid)`;
        const dismissed = await tx`
          select duplicate_state from financial_app.transactions where id=${duplicateAId}::uuid
        `;
        if (dismissed[0]?.duplicate_state !== "none") {
          throw new Error("test_transaction_review_dismiss_failed");
        }

        const candidates = await tx`
          select id,day_gap from financial_app.list_transfer_candidates(${transferAId}::uuid,3)
        `;
        if (candidates.length !== 1 || candidates[0]?.id !== transferBId || candidates[0]?.day_gap !== 1) {
          throw new Error("test_transaction_review_transfer_candidate_failed");
        }

        const paired = await tx`
          select financial_app.pair_internal_transfer(${transferAId}::uuid,${transferBId}::uuid) as result
        `;
        if (paired[0]?.result?.changed !== true || paired[0]?.result?.balanced !== true) {
          throw new Error("test_transaction_review_transfer_pair_failed");
        }
        const pairRows = await tx`
          select id,transfer_pair_id from financial_app.transactions where id in (${transferAId}::uuid,${transferBId}::uuid)
        `;
        if (
          pairRows.length !== 2 ||
          !pairRows.some((row: any) => row.id === transferAId && row.transfer_pair_id === transferBId) ||
          !pairRows.some((row: any) => row.id === transferBId && row.transfer_pair_id === transferAId)
        ) {
          throw new Error("test_transaction_review_transfer_symmetry_failed");
        }

        await tx`select financial_app.unpair_internal_transfer(${transferAId}::uuid)`;
        const unpaired = await tx`
          select count(*)::int as count from financial_app.transactions
          where id in (${transferAId}::uuid,${transferBId}::uuid) and transfer_pair_id is not null
        `;
        if (unpaired[0]?.count !== 0) throw new Error("test_transaction_review_unpair_failed");

        const sourceCheck = await tx`
          select count(*)::int as count
          from financial_app.transaction_source_records
          where source_file_id=${sourceFileId}
            and source_payload->>'test'=${token}
        `;
        if (sourceCheck[0]?.count !== 4) throw new Error("test_transaction_review_source_mutated");

        const auditRows = await tx`
          select count(*)::int as count
          from financial_app.audit_changes
          where entity_id=any(${createdTransactionIds}::uuid[])
            and field_name in ('duplicate_state','transfer_pair_id')
        `;
        if ((auditRows[0]?.count ?? 0) < 6) throw new Error("test_transaction_review_audit_failed");

        verified = true;
        throw new Error("__ROLLBACK_TRANSACTION_REVIEW_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_TRANSACTION_REVIEW_TEST__") throw error;
    }

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.accounts where name in (${'Phase4 review account A ' + token},${'Phase4 review account B ' + token})) as accounts,
        (select count(*)::int from financial_app.transaction_source_records where source_file_id=${sourceFileId}) as sources,
        (select count(*)::int from financial_app.transactions where source_row_identity like ${sourceFileId + '::%'}) as transactions,
        (select count(*)::int from financial_app.transaction_duplicate_reviews r join financial_app.transactions t on t.id=r.transaction_id where t.source_row_identity like ${sourceFileId + '::%'}) as duplicate_reviews,
        (select count(*)::int from financial_app.audit_changes where entity_id=any(${createdTransactionIds}::uuid[])) as audit_changes
    `;
    const residue = residueRows[0] ?? {};
    const clean = ["accounts", "sources", "transactions", "duplicate_reviews", "audit_changes"]
      .every((key) => residue[key] === 0);

    return json({ verified, clean, residue });
  }

  return null;
}
