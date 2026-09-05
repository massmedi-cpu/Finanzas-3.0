const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function nullableDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(`invalid_${field}`);
  return value;
}

function booleanValue(value: unknown, field: string) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") throw new Error(`invalid_${field}`);
  return value;
}

function financialFilters(payload: any) {
  const dateFrom = nullableDate(payload.dateFrom, "financial_date_from");
  const dateTo = nullableDate(payload.dateTo, "financial_date_to");
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("invalid_financial_date_range");
  return {
    dateFrom,
    dateTo,
    accountId: nullableUuid(payload.accountId, "financial_account_id"),
    includeArchived: booleanValue(payload.includeArchived, "financial_include_archived"),
  };
}

export async function handleFinancialLogicAction(input: {
  action: unknown;
  payload: any;
  sql: any;
  environment: unknown;
}): Promise<Response | null> {
  const { action, payload, sql, environment } = input;

  if (action === "financial.period") {
    const f = financialFilters(payload);
    const rows = await sql`
      select financial_app.financial_period_summary(
        ${f.dateFrom}::date,${f.dateTo}::date,${f.accountId}::uuid
      ) as result
    `;
    return json(rows[0]?.result ?? null);
  }

  if (action === "financial.balances") {
    const asOfDate = nullableDate(payload.asOfDate ?? payload.dateTo, "financial_as_of_date");
    const includeArchived = booleanValue(payload.includeArchived, "financial_include_archived");
    const rows = await sql`
      select financial_app.financial_account_balances(${asOfDate}::date,${includeArchived}) as result
    `;
    return json(rows[0]?.result ?? null);
  }

  if (action === "financial.monthly") {
    const f = financialFilters(payload);
    const rows = await sql`
      select financial_app.financial_monthly_series(
        ${f.dateFrom}::date,${f.dateTo}::date,${f.accountId}::uuid
      ) as result
    `;
    return json(rows[0]?.result ?? null);
  }

  if (action === "financial.snapshot") {
    const f = financialFilters(payload);
    const rows = await sql`
      select financial_app.financial_snapshot(
        ${f.dateFrom}::date,${f.dateTo}::date,${f.accountId}::uuid,${f.includeArchived}
      ) as result
    `;
    return json(rows[0]?.result ?? null);
  }

  if (action === "test.financial_logic_engine") {
    if (environment !== "preview") return json({ error: "test_financial_logic_engine_preview_only" }, 403);

    const token = crypto.randomUUID().slice(0, 8);
    const sourceFileId = `__phase5_gateway_${token}__`;
    const createdIds: string[] = [];
    let verified = false;

    try {
      await sql.begin(async (tx: any) => {
        const accounts = await tx`
          insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
          values
            (${'Phase5 gateway A ' + token},'Test','checking',10000,'EUR','active',0),
            (${'Phase5 gateway B ' + token},'Test','savings',5000,'EUR','active',1)
          returning id,name
        `;
        const accountA = accounts.find((row: any) => row.name === `Phase5 gateway A ${token}`)?.id;
        const accountB = accounts.find((row: any) => row.name === `Phase5 gateway B ${token}`)?.id;
        if (!accountA || !accountB) throw new Error("test_financial_accounts_failed");
        createdIds.push(accountA,accountB);

        const add = async (
          key: string,
          accountId: string,
          date: string,
          concept: string,
          kind: string,
          amount: number,
          balance: number,
          duplicateState = "none",
          excluded = false,
        ) => {
          const fingerprintChar = /^[0-9a-f]$/.test(key.slice(-1).toLowerCase()) ? key.slice(-1).toLowerCase() : "a";
          const fingerprint = `${token}${fingerprintChar.repeat(56)}`;
          const sourceRows = await tx`
            insert into financial_app.transaction_source_records(
              source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
              bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
            ) values (
              ${sourceFileId},'sheet-1',${key},${sourceFileId + '::sheet-1::' + key},
              ${fingerprint},${{ test: token, key }},${date}::date,${concept},${amount},${balance},
              ${accountId === accountA ? `Phase5 gateway A ${token}` : `Phase5 gateway B ${token}`}
            ) returning id
          `;
          const sourceId = sourceRows[0]?.id;
          if (!sourceId) throw new Error("test_financial_source_failed");
          const txRows = await tx`
            insert into financial_app.transactions(
              source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
            ) values (
              ${sourceId}::uuid,${sourceFileId + '::sheet-1::' + key},${accountId}::uuid,${date}::date,${concept},${kind},${amount},${balance},'confirmed',${duplicateState}
            ) returning id
          `;
          const transactionId = txRows[0]?.id;
          if (!transactionId) throw new Error("test_financial_transaction_failed");
          createdIds.push(transactionId);
          if (excluded) {
            await tx`
              insert into financial_app.transaction_overrides(transaction_id,excluded_from_analytics)
              values(${transactionId}::uuid,true)
            `;
          }
          return transactionId;
        };

        await add('F5-1',accountA,'2098-01-01','F5 INCOME','income',100000,110000);
        await add('F5-2',accountA,'2098-01-02','F5 EXPENSE','expense',-25000,85000);
        const transferA = await add('F5-3',accountA,'2098-01-03','F5 TRANSFER OUT','transfer',-20000,65000);
        const transferB = await add('F5-4',accountB,'2098-01-03','F5 TRANSFER IN','transfer',20000,25000);
        await tx`select financial_app.pair_internal_transfer(${transferA}::uuid,${transferB}::uuid)`;
        await add('F5-5',accountA,'2098-01-04','F5 SUSPECTED','expense',-5000,60000,'suspected');
        await add('F5-6',accountA,'2098-01-04','F5 CONFIRMED DUP','expense',-5000,55000,'confirmed');
        await add('F5-7',accountA,'2098-01-05','F5 EXCLUDED','expense',-7000,48000,'none',true);

        const rows = await tx`
          select financial_app.financial_snapshot('2098-01-01'::date,'2098-01-31'::date,null,false) as result
        `;
        const snapshot = rows[0]?.result;
        const period = snapshot?.period;
        const accountRow = snapshot?.balances?.accounts?.find((row: any) => row.id === accountA);
        verified =
          snapshot?.contractVersion === 1 &&
          period?.incomeCents === 100000 &&
          period?.expenseCents === 30000 &&
          period?.savingsCents === 70000 &&
          period?.transfers?.netCents === 0 &&
          period?.transfers?.pairedPairs === 1 &&
          period?.quality?.suspectedDuplicateRows === 1 &&
          period?.quality?.confirmedDuplicateRows === 1 &&
          period?.quality?.manuallyExcludedRows === 1 &&
          accountRow?.balanceCents === 48000 &&
          accountRow?.balanceSource === 'bank_explicit' &&
          snapshot?.principles?.bankSource === 'read_only';
        if (!verified) throw new Error("test_financial_logic_projection_failed");
        throw new Error("__ROLLBACK_FINANCIAL_LOGIC_TEST__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__ROLLBACK_FINANCIAL_LOGIC_TEST__") throw error;
    }

    const residueRows = await sql`
      select
        (select count(*)::int from financial_app.accounts where name in (${'Phase5 gateway A ' + token},${'Phase5 gateway B ' + token})) as accounts,
        (select count(*)::int from financial_app.transaction_source_records where source_file_id=${sourceFileId}) as sources,
        (select count(*)::int from financial_app.transactions where source_row_identity like ${sourceFileId + '::%'}) as transactions,
        (select count(*)::int from financial_app.audit_changes where entity_id=any(${createdIds}::uuid[])) as audit_changes
    `;
    const residue = residueRows[0] ?? {};
    const clean = ["accounts","sources","transactions","audit_changes"].every((key) => residue[key] === 0);
    return json({ verified, clean, residue });
  }

  return null;
}
