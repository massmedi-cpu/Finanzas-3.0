-- PRE-025 · zero-amount and completely-empty workspace smoke test.
-- Run ONLY on a disposable/staging database after all migrations.
-- Every mutation is enclosed in one transaction and the script always rolls back.

\set ON_ERROR_STOP on

begin;

insert into financial_app.workspaces(id,name)
values
  ('e5000000-0000-4000-8000-000000000001'::uuid,'PRE025 empty workspace'),
  ('e6000000-0000-4000-8000-000000000002'::uuid,'PRE025 exact zero workspace');

set role financial_app_gateway;
select pg_catalog.set_config('financial_app.user_id','e9000000-0000-4000-8000-000000000009',true);

-- EDGE-009: the tenant exists but every business table is empty for its scope.
select pg_catalog.set_config('financial_app.workspace_id','e5000000-0000-4000-8000-000000000001',true);

do $$
declare
  v_period jsonb;
  v_monthly jsonb;
  v_balances jsonb;
  v_budget jsonb;
  v_recurrences jsonb;
  v_forecast jsonb;
  v_transactions jsonb;
  v_documents jsonb;
  v_serialized text;
begin
  v_period := financial_app.financial_period_summary('2026-09-01','2026-09-30',null);
  v_monthly := financial_app.financial_monthly_series('2026-09-01','2026-09-30',null);
  v_balances := financial_app.financial_account_balances('2026-09-30',false,null);
  v_budget := financial_app.budget_month_snapshot('2026-09');
  v_recurrences := financial_app.recurrence_candidate_snapshot('2026-01-01','2026-09-30',3);
  v_forecast := financial_app.forecast_snapshot('2026-09-01','2026-09-30',null);
  v_transactions := financial_app.query_effective_transactions(
    null,null,null,null,null,null,null,null,null,null,null,50,false
  );
  v_documents := financial_app.document_list(null,null,50,0);

  if (v_period->'quality'->>'scopedRows')::int <> 0
     or (v_period->>'incomeCents')::bigint <> 0
     or (v_period->>'expenseCents')::bigint <> 0
     or (v_period->>'operatingNetCents')::bigint <> 0
     or v_period->>'savingsRateBps' is not null then
    raise exception 'PRE025_EMPTY_FINANCIAL_PERIOD_FAILED:%',v_period;
  end if;

  if jsonb_array_length(v_monthly->'rows') <> 1
     or (v_monthly->'rows'->0->>'rows')::int <> 0
     or (v_monthly->'rows'->0->>'expenseCents')::bigint <> 0 then
    raise exception 'PRE025_EMPTY_MONTHLY_FAILED:%',v_monthly;
  end if;

  if jsonb_array_length(v_balances->'accounts') <> 0
     or (v_balances->>'totalBalanceCents')::bigint <> 0 then
    raise exception 'PRE025_EMPTY_BALANCES_FAILED:%',v_balances;
  end if;

  if v_budget->'total'->>'status' <> 'empty'
     or jsonb_array_length(v_budget->'categories') <> 0 then
    raise exception 'PRE025_EMPTY_BUDGET_FAILED:%',v_budget;
  end if;

  if (v_recurrences->>'candidateCount')::int <> 0
     or jsonb_array_length(v_recurrences->'candidates') <> 0 then
    raise exception 'PRE025_EMPTY_RECURRENCES_FAILED:%',v_recurrences;
  end if;

  if jsonb_array_length(v_forecast->'items') <> 0
     or (v_forecast->'summary'->>'plannedItems')::int <> 0
     or (v_forecast->'summary'->>'projectedClosingBalanceCents')::bigint <> 0 then
    raise exception 'PRE025_EMPTY_FORECAST_FAILED:%',v_forecast;
  end if;

  if (v_transactions->>'totalCount')::int <> 0
     or jsonb_array_length(v_transactions->'rows') <> 0 then
    raise exception 'PRE025_EMPTY_TRANSACTIONS_FAILED:%',v_transactions;
  end if;

  if (v_documents->>'total')::int <> 0
     or jsonb_array_length(v_documents->'items') <> 0 then
    raise exception 'PRE025_EMPTY_DOCUMENTS_FAILED:%',v_documents;
  end if;

  v_serialized := concat_ws('|',v_period::text,v_monthly::text,v_balances::text,v_budget::text,
    v_recurrences::text,v_forecast::text,v_transactions::text,v_documents::text);
  if v_serialized ~* '(^|[^a-z])(nan|infinity)([^a-z]|$)' then
    raise exception 'PRE025_EMPTY_NON_FINITE_VALUE:%',v_serialized;
  end if;
end
$$;

-- EDGE-001: zero is a valid imported observation when its source kind is explicit.
select pg_catalog.set_config('financial_app.workspace_id','e6000000-0000-4000-8000-000000000002',true);

do $$
declare
  v_account uuid;
  v_source uuid;
  v_transaction uuid;
  v_period jsonb;
  v_monthly jsonb;
  v_query jsonb;
  v_fact record;
begin
  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values ('PRE025 Cuenta cero','Banco prueba','checking',100000,'EUR','active',0)
  returning id into v_account;

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values (
    '__pre025_zero__','sheet-zero','ZERO-1','__pre025_zero__::sheet-zero::ZERO-1',repeat('0',64),
    '{"ID origen":"ZERO-1","Importe (€)":0}'::jsonb,'2026-09-01','MOVIMIENTO CERO',0,100000,'PRE025 Cuenta cero'
  ) returning id into v_source;

  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,
    amount_cents,balance_after_cents,review_state,duplicate_state
  ) values (
    v_source,'__pre025_zero__::sheet-zero::ZERO-1',v_account,'2026-09-01','MOVIMIENTO CERO','expense',
    0,100000,'confirmed','none'
  ) returning id into v_transaction;

  select * into v_fact
  from financial_app.financial_transaction_facts('2026-09-01','2026-09-30',v_account)
  where transaction_id=v_transaction;

  if v_fact.transaction_id is null
     or v_fact.amount_cents <> 0
     or v_fact.effective_kind <> 'expense'
     or not v_fact.analytics_eligible
     or v_fact.sign_mismatch then
    raise exception 'PRE025_ZERO_FACT_FAILED:%',to_jsonb(v_fact);
  end if;

  v_period := financial_app.financial_period_summary('2026-09-01','2026-09-30',v_account);
  if (v_period->'quality'->>'scopedRows')::int <> 1
     or (v_period->'quality'->>'includedRows')::int <> 1
     or (v_period->'quality'->>'signMismatchRows')::int <> 0
     or (v_period->>'expenseCents')::bigint <> 0
     or (v_period->>'operatingNetCents')::bigint <> 0
     or v_period->>'savingsRateBps' is not null then
    raise exception 'PRE025_ZERO_PERIOD_FAILED:%',v_period;
  end if;

  v_monthly := financial_app.financial_monthly_series('2026-09-01','2026-09-30',v_account);
  if (v_monthly->'rows'->0->>'rows')::int <> 1
     or (v_monthly->'rows'->0->>'expenseCents')::bigint <> 0
     or (v_monthly->'rows'->0->>'operatingNetCents')::bigint <> 0 then
    raise exception 'PRE025_ZERO_MONTHLY_FAILED:%',v_monthly;
  end if;

  v_query := financial_app.query_effective_transactions(
    null,v_account,null,null,null,null,null,'2026-09-01','2026-09-30',null,null,50,false
  );
  if (v_query->>'totalCount')::int <> 1
     or (v_query->'rows'->0->>'amountCents')::bigint <> 0
     or v_query->'rows'->0->'kind'->>'effective' <> 'expense' then
    raise exception 'PRE025_ZERO_QUERY_FAILED:%',v_query;
  end if;
end
$$;

reset role;
rollback;

\echo 'PRE025_ZERO_EMPTY_DB_SMOKE_OK'
