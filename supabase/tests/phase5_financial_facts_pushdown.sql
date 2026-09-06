begin;

create temp table phase5_financial_pushdown_result (
  test_name text primary key,
  passed boolean not null
) on commit drop;

do $$
declare
  v_account_a uuid;
  v_account_b uuid;
  v_source uuid;
  v_facts_count int;
  v_period jsonb;
  v_period_implicit jsonb;
  v_monthly jsonb;
begin
  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values ('Phase5 pushdown A','Test','checking',0,'EUR','active',0)
  returning id into v_account_a;

  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values ('Phase5 pushdown B','Test','savings',0,'EUR','active',1)
  returning id into v_account_b;

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values (
    '__phase5_pushdown__','sheet-a','A-1','__phase5_pushdown__::sheet-a::A-1',repeat('8',64),'{}'::jsonb,
    '2099-06-01','INCOME A',1000,1000,'Phase5 pushdown A'
  ) returning id into v_source;
  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
  ) values (
    v_source,'__phase5_pushdown__::sheet-a::A-1',v_account_a,'2099-06-01','INCOME A','income',1000,1000,'confirmed','none'
  );

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values (
    '__phase5_pushdown__','sheet-a','A-2','__phase5_pushdown__::sheet-a::A-2',repeat('9',64),'{}'::jsonb,
    '2099-06-02','EXPENSE A',-200,800,'Phase5 pushdown A'
  ) returning id into v_source;
  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
  ) values (
    v_source,'__phase5_pushdown__::sheet-a::A-2',v_account_a,'2099-06-02','EXPENSE A','expense',-200,800,'confirmed','none'
  );

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values (
    '__phase5_pushdown__','sheet-b','B-1','__phase5_pushdown__::sheet-b::B-1',repeat('a',64),'{}'::jsonb,
    '2099-06-01','INCOME B',5000,5000,'Phase5 pushdown B'
  ) returning id into v_source;
  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
  ) values (
    v_source,'__phase5_pushdown__::sheet-b::B-1',v_account_b,'2099-06-01','INCOME B','income',5000,5000,'confirmed','none'
  );

  select count(*)::int into v_facts_count
  from financial_app.financial_transaction_facts('2099-06-01','2099-06-30',v_account_a);

  insert into phase5_financial_pushdown_result values(
    'parameterized-facts-limit-account-and-period',
    v_facts_count=2
  );

  v_period := financial_app.financial_period_summary('2099-06-01','2099-06-30',v_account_a);
  insert into phase5_financial_pushdown_result values(
    'period-summary-keeps-identical-scoped-semantics',
    v_period->>'accountId'=v_account_a::text
      and (v_period->>'incomeCents')::bigint=1000
      and (v_period->>'expenseCents')::bigint=200
      and (v_period->>'savingsCents')::bigint=800
      and (v_period->'quality'->>'scopedRows')::int=2
  );

  v_monthly := financial_app.financial_monthly_series('2099-06-01','2099-06-30',v_account_a);
  insert into phase5_financial_pushdown_result values(
    'monthly-series-keeps-identical-scoped-semantics',
    v_monthly->>'accountId'=v_account_a::text
      and jsonb_array_length(v_monthly->'rows')=1
      and (v_monthly->'rows'->0->>'incomeCents')::bigint=1000
      and (v_monthly->'rows'->0->>'expenseCents')::bigint=200
      and (v_monthly->'rows'->0->>'operatingNetCents')::bigint=800
  );

  v_period_implicit := financial_app.financial_period_summary(null,null,v_account_a);
  insert into phase5_financial_pushdown_result values(
    'implicit-date-bounds-still-derive-from-selected-account',
    v_period_implicit->>'dateFrom'='2099-06-01'
      and v_period_implicit->>'dateTo'='2099-06-02'
      and (v_period_implicit->>'incomeCents')::bigint=1000
      and (v_period_implicit->>'expenseCents')::bigint=200
  );
end $$;

insert into phase5_financial_pushdown_result values(
  'parameterized-facts-remain-gateway-only',
  not has_function_privilege('anon','financial_app.financial_transaction_facts(date,date,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','financial_app.financial_transaction_facts(date,date,uuid)','EXECUTE')
  and has_function_privilege('service_role','financial_app.financial_transaction_facts(date,date,uuid)','EXECUTE')
);

do $$
begin
  if exists(select 1 from phase5_financial_pushdown_result where not passed) then
    raise exception 'phase5_financial_pushdown_regression';
  end if;
end $$;

select * from phase5_financial_pushdown_result order by test_name;

rollback;
