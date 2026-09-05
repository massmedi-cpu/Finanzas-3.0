begin;

create temp table phase5_financial_logic_result (
  test_name text primary key,
  passed boolean not null
) on commit drop;

do $$
declare
  v_account_a uuid;
  v_account_b uuid;
  v_account_archived uuid;
  v_source uuid;
  v_income uuid;
  v_expense uuid;
  v_transfer_a uuid;
  v_transfer_b uuid;
  v_suspected uuid;
  v_confirmed uuid;
  v_excluded uuid;
  v_summary jsonb;
  v_balances jsonb;
  v_balances_all jsonb;
  v_monthly jsonb;
  v_snapshot jsonb;
  v_invalid_range_rejected boolean := false;
begin
  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values ('Phase5 financial A','Test','checking',10000,'EUR','active',0)
  returning id into v_account_a;

  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values ('Phase5 financial B','Test','savings',5000,'EUR','active',1)
  returning id into v_account_b;

  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values ('Phase5 financial archived','Test','other',1234,'EUR','archived',2)
  returning id into v_account_archived;

  insert into financial_app.transaction_source_records(source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key)
  values ('__phase5_financial_test__','sheet-a','A-1','__phase5_financial_test__::sheet-a::A-1',repeat('1',64),'{}'::jsonb,'2099-01-01','INCOME',100000,110000,'Phase5 financial A') returning id into v_source;
  insert into financial_app.transactions(source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state)
  values(v_source,'__phase5_financial_test__::sheet-a::A-1',v_account_a,'2099-01-01','INCOME','income',100000,110000,'confirmed','none') returning id into v_income;

  insert into financial_app.transaction_source_records(source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key)
  values ('__phase5_financial_test__','sheet-a','A-2','__phase5_financial_test__::sheet-a::A-2',repeat('2',64),'{}'::jsonb,'2099-01-02','EXPENSE',-25000,85000,'Phase5 financial A') returning id into v_source;
  insert into financial_app.transactions(source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state)
  values(v_source,'__phase5_financial_test__::sheet-a::A-2',v_account_a,'2099-01-02','EXPENSE','expense',-25000,85000,'confirmed','none') returning id into v_expense;

  insert into financial_app.transaction_source_records(source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key)
  values ('__phase5_financial_test__','sheet-a','A-3','__phase5_financial_test__::sheet-a::A-3',repeat('3',64),'{}'::jsonb,'2099-01-03','TRANSFER OUT',-20000,65000,'Phase5 financial A') returning id into v_source;
  insert into financial_app.transactions(source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state)
  values(v_source,'__phase5_financial_test__::sheet-a::A-3',v_account_a,'2099-01-03','TRANSFER OUT','transfer',-20000,65000,'confirmed','none') returning id into v_transfer_a;

  insert into financial_app.transaction_source_records(source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key)
  values ('__phase5_financial_test__','sheet-b','B-1','__phase5_financial_test__::sheet-b::B-1',repeat('4',64),'{}'::jsonb,'2099-01-03','TRANSFER IN',20000,25000,'Phase5 financial B') returning id into v_source;
  insert into financial_app.transactions(source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state)
  values(v_source,'__phase5_financial_test__::sheet-b::B-1',v_account_b,'2099-01-03','TRANSFER IN','transfer',20000,25000,'confirmed','none') returning id into v_transfer_b;

  perform financial_app.pair_internal_transfer(v_transfer_a,v_transfer_b);

  insert into financial_app.transaction_source_records(source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key)
  values ('__phase5_financial_test__','sheet-a','A-4','__phase5_financial_test__::sheet-a::A-4',repeat('5',64),'{}'::jsonb,'2099-01-04','SUSPECTED DUP',-5000,60000,'Phase5 financial A') returning id into v_source;
  insert into financial_app.transactions(source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state)
  values(v_source,'__phase5_financial_test__::sheet-a::A-4',v_account_a,'2099-01-04','SUSPECTED DUP','expense',-5000,60000,'pending','suspected') returning id into v_suspected;

  insert into financial_app.transaction_source_records(source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key)
  values ('__phase5_financial_test__','sheet-a','A-5','__phase5_financial_test__::sheet-a::A-5',repeat('6',64),'{}'::jsonb,'2099-01-04','CONFIRMED DUP',-5000,55000,'Phase5 financial A') returning id into v_source;
  insert into financial_app.transactions(source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state)
  values(v_source,'__phase5_financial_test__::sheet-a::A-5',v_account_a,'2099-01-04','CONFIRMED DUP','expense',-5000,55000,'confirmed','confirmed') returning id into v_confirmed;

  insert into financial_app.transaction_source_records(source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key)
  values ('__phase5_financial_test__','sheet-a','A-6','__phase5_financial_test__::sheet-a::A-6',repeat('7',64),'{}'::jsonb,'2099-01-05','EXCLUDED',-7000,48000,'Phase5 financial A') returning id into v_source;
  insert into financial_app.transactions(source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state)
  values(v_source,'__phase5_financial_test__::sheet-a::A-6',v_account_a,'2099-01-05','EXCLUDED','expense',-7000,48000,'confirmed','none') returning id into v_excluded;
  insert into financial_app.transaction_overrides(transaction_id,excluded_from_analytics)
  values(v_excluded,true);

  v_summary := financial_app.financial_period_summary('2099-01-01','2099-01-31',null);
  insert into phase5_financial_logic_result values(
    'period-separates-operating-and-transfers',
    (v_summary->>'incomeCents')::bigint=100000
      and (v_summary->>'expenseCents')::bigint=30000
      and (v_summary->>'operatingNetCents')::bigint=70000
      and (v_summary->>'savingsCents')::bigint=70000
      and (v_summary->>'savingsRateBps')::int=7000
      and (v_summary->'transfers'->>'rows')::int=2
      and (v_summary->'transfers'->>'pairedPairs')::int=1
      and (v_summary->'transfers'->>'netCents')::bigint=0
      and (v_summary->'transfers'->>'grossCents')::bigint=40000
  );

  insert into phase5_financial_logic_result values(
    'quality-respects-suspected-confirmed-and-manual-exclusion',
    (v_summary->'quality'->>'scopedRows')::int=7
      and (v_summary->'quality'->>'includedRows')::int=5
      and (v_summary->'quality'->>'suspectedDuplicateRows')::int=1
      and (v_summary->'quality'->>'confirmedDuplicateRows')::int=1
      and (v_summary->'quality'->>'manuallyExcludedRows')::int=1
  );

  v_balances := financial_app.financial_account_balances('2099-01-31',false);
  insert into phase5_financial_logic_result values(
    'explicit-bank-balance-has-priority',
    exists(
      select 1 from jsonb_array_elements(v_balances->'accounts') r
      where r->>'id'=v_account_a::text
        and r->>'balanceSource'='bank_explicit'
        and (r->>'balanceCents')::bigint=48000
        and (r->>'reconstructedBalanceCents')::bigint=53000
        and (r->>'reconstructionDeltaCents')::bigint=-5000
    )
    and exists(
      select 1 from jsonb_array_elements(v_balances->'accounts') r
      where r->>'id'=v_account_b::text
        and r->>'balanceSource'='bank_explicit'
        and (r->>'balanceCents')::bigint=25000
        and (r->>'reconstructionDeltaCents')::bigint=0
    )
  );

  insert into phase5_financial_logic_result values(
    'archived-balance-excluded-by-default',
    not exists(select 1 from jsonb_array_elements(v_balances->'accounts') r where r->>'id'=v_account_archived::text)
  );

  v_balances_all := financial_app.financial_account_balances('2099-01-31',true);
  insert into phase5_financial_logic_result values(
    'archived-balance-is-opt-in',
    exists(
      select 1 from jsonb_array_elements(v_balances_all->'accounts') r
      where r->>'id'=v_account_archived::text
        and r->>'balanceSource'='reconstructed'
        and (r->>'balanceCents')::bigint=1234
    )
  );

  v_monthly := financial_app.financial_monthly_series('2099-01-01','2099-01-31',null);
  insert into phase5_financial_logic_result values(
    'monthly-series-reuses-central-facts',
    jsonb_array_length(v_monthly->'rows')=1
      and (v_monthly->'rows'->0->>'incomeCents')::bigint=100000
      and (v_monthly->'rows'->0->>'expenseCents')::bigint=30000
      and (v_monthly->'rows'->0->>'operatingNetCents')::bigint=70000
      and (v_monthly->'rows'->0->>'transferNetCents')::bigint=0
  );

  v_snapshot := financial_app.financial_snapshot('2099-01-01','2099-01-31',null,false);
  insert into phase5_financial_logic_result values(
    'snapshot-contract-is-central-and-read-only',
    (v_snapshot->>'contractVersion')::int=1
      and (v_snapshot->'principles'->>'bankSource')='read_only'
      and (v_snapshot->'principles'->>'transfersExcludedFromSavings')::boolean
      and (v_snapshot->'principles'->>'suspectedDuplicatesIncluded')::boolean
      and (v_snapshot->'principles'->>'confirmedDuplicatesExcluded')::boolean
      and (v_snapshot->'principles'->>'explicitBankBalancePreferred')::boolean
  );

  begin
    perform financial_app.financial_period_summary('2099-02-01','2099-01-01',null);
  exception when others then
    v_invalid_range_rejected := sqlerrm like '%invalid_financial_date_range%';
  end;
  insert into phase5_financial_logic_result values('invalid-date-range-rejected',v_invalid_range_rejected);
end $$;

insert into phase5_financial_logic_result values(
  'financial-functions-not-public',
  not has_function_privilege('anon','financial_app.financial_transaction_facts()','EXECUTE')
  and not has_function_privilege('authenticated','financial_app.financial_transaction_facts()','EXECUTE')
  and not has_function_privilege('anon','financial_app.financial_period_summary(date,date,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','financial_app.financial_period_summary(date,date,uuid)','EXECUTE')
  and not has_function_privilege('anon','financial_app.financial_account_balances(date,boolean)','EXECUTE')
  and not has_function_privilege('authenticated','financial_app.financial_account_balances(date,boolean)','EXECUTE')
  and not has_function_privilege('anon','financial_app.financial_snapshot(date,date,uuid,boolean)','EXECUTE')
  and not has_function_privilege('authenticated','financial_app.financial_snapshot(date,date,uuid,boolean)','EXECUTE')
  and has_function_privilege('service_role','financial_app.financial_snapshot(date,date,uuid,boolean)','EXECUTE')
);

do $$
begin
  if exists(select 1 from phase5_financial_logic_result where not passed) then
    raise exception 'phase5_financial_logic_regression';
  end if;
end $$;

select * from phase5_financial_logic_result order by test_name;

rollback;
