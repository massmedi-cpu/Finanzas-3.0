begin;

create temp table phase4_duplicate_transfer_result (
  test_name text primary key,
  passed boolean not null
) on commit drop;

do $$
declare
  v_account_a uuid;
  v_account_b uuid;
  v_source_a uuid;
  v_source_b uuid;
  v_source_dup_a uuid;
  v_source_dup_b uuid;
  v_transfer_a uuid;
  v_transfer_b uuid;
  v_duplicate_a uuid;
  v_duplicate_b uuid;
  v_query jsonb;
  v_pair jsonb;
  v_after_unpair jsonb;
begin
  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values ('Phase4 transfer test A','Test','checking',0,'EUR','active',0)
  returning id into v_account_a;

  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values ('Phase4 transfer test B','Test','savings',0,'EUR','active',1)
  returning id into v_account_b;

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values (
    '__phase4_transfer_test__','sheet-1','T-1','__phase4_transfer_test__::sheet-1::T-1',repeat('1',64),'{}'::jsonb,
    '2026-09-05','TRANSFER TEST A',-10000,90000,'Phase4 transfer test A'
  ) returning id into v_source_a;

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values (
    '__phase4_transfer_test__','sheet-1','T-2','__phase4_transfer_test__::sheet-1::T-2',repeat('2',64),'{}'::jsonb,
    '2026-09-06','TRANSFER TEST B',10000,100000,'Phase4 transfer test B'
  ) returning id into v_source_b;

  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
  ) values (
    v_source_a,'__phase4_transfer_test__::sheet-1::T-1',v_account_a,'2026-09-05','PHASE4 TRANSFER TEST','expense',-10000,90000,'confirmed','none'
  ) returning id into v_transfer_a;

  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
  ) values (
    v_source_b,'__phase4_transfer_test__::sheet-1::T-2',v_account_b,'2026-09-06','PHASE4 TRANSFER TEST','income',10000,100000,'confirmed','none'
  ) returning id into v_transfer_b;

  insert into financial_app.transaction_overrides(transaction_id,kind_override)
  values (v_transfer_a,'transfer'),(v_transfer_b,'transfer');

  insert into phase4_duplicate_transfer_result values (
    'candidate-uses-effective-kind',
    exists(select 1 from financial_app.list_transfer_candidates(v_transfer_a,3) where id=v_transfer_b and day_gap=1)
  );

  v_pair := financial_app.pair_internal_transfer(v_transfer_a,v_transfer_b);
  insert into phase4_duplicate_transfer_result values (
    'pair-symmetric',
    coalesce((v_pair->>'changed')::boolean,false)
      and (select transfer_pair_id=v_transfer_b from financial_app.transactions where id=v_transfer_a)
      and (select transfer_pair_id=v_transfer_a from financial_app.transactions where id=v_transfer_b)
  );

  perform financial_app.apply_transaction_override_patch(array[v_transfer_a,v_transfer_b],'{"kind":null}'::jsonb);
  v_query := financial_app.query_effective_transactions('PHASE4 TRANSFER TEST',null,null,null,null,null,null,null,null,null,null,10,false);
  insert into phase4_duplicate_transfer_result values (
    'paired-kind-remains-transfer-after-override-clear',
    jsonb_array_length(v_query->'rows')=2
      and not exists (
        select 1
        from jsonb_array_elements(v_query->'rows') r
        where r->'kind'->>'effective' <> 'transfer'
      )
  );

  insert into phase4_duplicate_transfer_result values (
    'paired-filter-is-transfer',
    (financial_app.query_effective_transactions('PHASE4 TRANSFER TEST',null,null,null,'transfer',null,null,null,null,null,null,10,false)->>'totalCount')::int=2
  );

  perform financial_app.unpair_internal_transfer(v_transfer_a);
  v_after_unpair := financial_app.query_effective_transactions('PHASE4 TRANSFER TEST',null,null,null,null,null,null,null,null,null,null,10,false);
  insert into phase4_duplicate_transfer_result values (
    'unpair-restores-base-kinds',
    exists(select 1 from jsonb_array_elements(v_after_unpair->'rows') r where r->>'id'=v_transfer_a::text and r->'kind'->>'effective'='expense')
      and exists(select 1 from jsonb_array_elements(v_after_unpair->'rows') r where r->>'id'=v_transfer_b::text and r->'kind'->>'effective'='income')
  );

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values (
    '__phase4_duplicate_test__','sheet-1','D-1','__phase4_duplicate_test__::sheet-1::D-1',repeat('3',64),'{}'::jsonb,
    '2026-09-05','DUP TEST',-1234,80000,'Phase4 transfer test A'
  ) returning id into v_source_dup_a;

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values (
    '__phase4_duplicate_test__','sheet-1','D-2','__phase4_duplicate_test__::sheet-1::D-2',repeat('4',64),'{}'::jsonb,
    '2026-09-05','DUP TEST',-1234,78766,'Phase4 transfer test A'
  ) returning id into v_source_dup_b;

  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
  ) values (
    v_source_dup_a,'__phase4_duplicate_test__::sheet-1::D-1',v_account_a,'2026-09-05','DUP TEST','expense',-1234,80000,'pending','none'
  ) returning id into v_duplicate_a;

  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,amount_cents,balance_after_cents,review_state,duplicate_state
  ) values (
    v_source_dup_b,'__phase4_duplicate_test__::sheet-1::D-2',v_account_a,'2026-09-05','DUP TEST','expense',-1234,78766,'pending','none'
  ) returning id into v_duplicate_b;

  perform financial_app.refresh_duplicate_candidates(v_duplicate_a);
  insert into phase4_duplicate_transfer_result values (
    'duplicate-group-detected',
    (select count(*)=2 and bool_and(duplicate_state='suspected') from financial_app.list_duplicate_group(v_duplicate_a))
  );

  perform financial_app.review_duplicate(v_duplicate_a,'confirmed');
  insert into phase4_duplicate_transfer_result values (
    'duplicate-confirmed-audited',
    (select duplicate_state='confirmed' from financial_app.transactions where id=v_duplicate_a)
      and exists(select 1 from financial_app.transaction_duplicate_reviews where transaction_id=v_duplicate_a and decision='confirmed')
      and exists(select 1 from financial_app.audit_changes where entity_id=v_duplicate_a and field_name='duplicate_state' and change_origin='user')
  );
end $$;

insert into phase4_duplicate_transfer_result values (
  'review-functions-not-public',
  not has_function_privilege('anon','financial_app.review_duplicate(uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','financial_app.review_duplicate(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','financial_app.pair_internal_transfer(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','financial_app.pair_internal_transfer(uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','financial_app.review_duplicate(uuid,text)','EXECUTE')
  and has_function_privilege('service_role','financial_app.pair_internal_transfer(uuid,uuid)','EXECUTE')
);

do $$
begin
  if exists(select 1 from phase4_duplicate_transfer_result where not passed) then
    raise exception 'phase4_duplicate_transfer_engine_regression';
  end if;
end $$;

select * from phase4_duplicate_transfer_result order by test_name;

rollback;
