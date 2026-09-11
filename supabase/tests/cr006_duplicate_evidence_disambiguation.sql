\set ON_ERROR_STOP on

begin;

insert into financial_app.workspaces(id,name)
values ('11111111-1111-4111-8111-111111111111','CR006 duplicate evidence regression');
select pg_catalog.set_config('financial_app.workspace_id','11111111-1111-4111-8111-111111111111',true);
set local role financial_app_gateway;

create temp table cr006_ids(kind text,id uuid) on commit drop;

with account_row as (
  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values('CR006 duplicate regression','Banco prueba','checking',0,'EUR','active',0)
  returning id
)
insert into cr006_ids select 'account',id from account_row;

-- Misma firma base, saldos distintos: dos operaciones reales.
with source_rows as (
  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values
    ('__cr006_dup__','sheet','B1','__cr006_dup__::sheet::B1',repeat('1',64),'{"Hora":"10:00"}'::jsonb,'2026-09-11','BALANCE DISTINCT',-100,10000,'cr006'),
    ('__cr006_dup__','sheet','B2','__cr006_dup__::sheet::B2',repeat('2',64),'{"Hora":"10:00"}'::jsonb,'2026-09-11','BALANCE DISTINCT',-100,9900,'cr006')
  returning id,source_row_key,balance_after_cents
), tx as (
  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,
    amount_cents,balance_after_cents,review_state,duplicate_state
  )
  select id,'__cr006_dup__::sheet::'||source_row_key,(select id from cr006_ids where kind='account'),
    '2026-09-11','BALANCE DISTINCT','expense',-100,balance_after_cents,'pending','none'
  from source_rows
  returning id
)
insert into cr006_ids select 'balance',id from tx;
select financial_app.recompute_duplicate_signature((select id from cr006_ids where kind='account'),'2026-09-11',-100,'BALANCE DISTINCT');

-- Sin saldo, horas distintas: dos operaciones reales.
with source_rows as (
  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values
    ('__cr006_dup__','sheet','T1','__cr006_dup__::sheet::T1',repeat('3',64),'{"Hora":"11:00"}'::jsonb,'2026-09-11','TIME DISTINCT',-200,null,'cr006'),
    ('__cr006_dup__','sheet','T2','__cr006_dup__::sheet::T2',repeat('4',64),'{"Hora":"12:00"}'::jsonb,'2026-09-11','TIME DISTINCT',-200,null,'cr006')
  returning id,source_row_key
), tx as (
  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,
    amount_cents,balance_after_cents,review_state,duplicate_state
  )
  select id,'__cr006_dup__::sheet::'||source_row_key,(select id from cr006_ids where kind='account'),
    '2026-09-11','TIME DISTINCT','expense',-200,null,'pending','none'
  from source_rows
  returning id
)
insert into cr006_ids select 'time',id from tx;
select financial_app.recompute_duplicate_signature((select id from cr006_ids where kind='account'),'2026-09-11',-200,'TIME DISTINCT');

-- Evidencia indistinguible: sigue siendo candidato real.
with source_rows as (
  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,source_payload,
    bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  ) values
    ('__cr006_dup__','sheet','D1','__cr006_dup__::sheet::D1',repeat('5',64),'{"Hora":"13:00"}'::jsonb,'2026-09-11','TRUE CANDIDATE',-300,5000,'cr006'),
    ('__cr006_dup__','sheet','D2','__cr006_dup__::sheet::D2',repeat('6',64),'{"Hora":"13:00"}'::jsonb,'2026-09-11','TRUE CANDIDATE',-300,5000,'cr006')
  returning id,source_row_key,balance_after_cents
), tx as (
  insert into financial_app.transactions(
    source_record_id,source_row_identity,account_id,bank_date,concept_normalized,kind,
    amount_cents,balance_after_cents,review_state,duplicate_state
  )
  select id,'__cr006_dup__::sheet::'||source_row_key,(select id from cr006_ids where kind='account'),
    '2026-09-11','TRUE CANDIDATE','expense',-300,balance_after_cents,'pending','none'
  from source_rows
  returning id
)
insert into cr006_ids select 'true',id from tx;
select financial_app.recompute_duplicate_signature((select id from cr006_ids where kind='account'),'2026-09-11',-300,'TRUE CANDIDATE');

do $$
declare
  v_true uuid;
  v_separated uuid;
  v_review jsonb;
  v_failed_closed boolean := false;
begin
  if exists(
    select 1 from financial_app.transactions
    where id in (select id from cr006_ids where kind='balance')
      and duplicate_state <> 'none'
  ) then
    raise exception 'balance_distinct_false_positive';
  end if;

  if exists(
    select 1 from financial_app.transactions
    where id in (select id from cr006_ids where kind='time')
      and duplicate_state <> 'none'
  ) then
    raise exception 'time_distinct_false_positive';
  end if;

  if (
    select count(*) from financial_app.transactions
    where id in (select id from cr006_ids where kind='true')
      and duplicate_state='suspected'
  ) <> 2 then
    raise exception 'true_candidate_not_suspected';
  end if;

  select id into v_true from cr006_ids where kind='true' order by id limit 1;
  if (select count(*) from financial_app.list_duplicate_group(v_true)) <> 2 then
    raise exception 'true_candidate_group_wrong';
  end if;

  v_review := financial_app.review_duplicate(v_true,'confirmed');
  if coalesce(v_review->>'duplicateState','') <> 'confirmed'
     or coalesce((v_review->>'candidateCount')::int,0) <> 2 then
    raise exception 'true_candidate_review_failed';
  end if;

  perform financial_app.refresh_duplicate_candidates(v_true);
  if (select duplicate_state from financial_app.transactions where id=v_true) <> 'confirmed' then
    raise exception 'confirmed_review_not_preserved';
  end if;

  select id into v_separated from cr006_ids where kind='balance' order by id limit 1;
  begin
    perform financial_app.review_duplicate(v_separated,'confirmed');
  exception when others then
    if sqlerrm='transaction_not_duplicate_candidate' then
      v_failed_closed := true;
    else
      raise;
    end if;
  end;
  if not v_failed_closed then
    raise exception 'separated_candidate_review_not_blocked';
  end if;
end;
$$;

reset role;
rollback;

do $$
declare
  v_public_grants integer;
begin
  if not pg_catalog.has_function_privilege('financial_app_gateway','financial_app.duplicate_candidate_group(uuid)','EXECUTE') then
    raise exception 'helper_gateway_execute_missing';
  end if;
  if pg_catalog.has_function_privilege('anon','financial_app.duplicate_candidate_group(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','financial_app.duplicate_candidate_group(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','financial_app.duplicate_candidate_group(uuid)','EXECUTE') then
    raise exception 'helper_unexpected_role_execute';
  end if;

  select count(*) into v_public_grants
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
  where n.nspname='financial_app'
    and p.proname='duplicate_candidate_group'
    and acl.grantee=0
    and acl.privilege_type='EXECUTE';
  if v_public_grants <> 0 then
    raise exception 'helper_public_execute_present';
  end if;
end;
$$;

select 'CR006_DUPLICATE_EVIDENCE_DISAMBIGUATION_OK' as marker;
