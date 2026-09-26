begin;

do $$
declare
  v_workspace uuid := gen_random_uuid();
  v_account uuid;
  v_source uuid;
  v_result jsonb;
  v_as_of_gap jsonb;
  v_day date;
  v_amount bigint;
  v_bank bigint;
  v_index integer;
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='financial_app'
      and c.relname in ('schema_meta','workspaces','workspace_memberships',
        'workspace_deletion_runtime_policy','workspace_deletion_receipts')
      and not c.relrowsecurity
  ) then
    raise exception 'control_rls_not_enabled';
  end if;
  if has_table_privilege('anon','financial_app.workspaces','SELECT')
     or has_table_privilege('authenticated','financial_app.workspace_memberships','SELECT')
     or has_table_privilege('financial_app_gateway','financial_app.workspaces','SELECT')
     or has_table_privilege('financial_app_gateway','financial_app.workspace_deletion_runtime_policy','UPDATE')
     or not has_table_privilege('financial_app_gateway','financial_app.workspace_deletion_runtime_policy','SELECT')
     or not exists (
       select 1 from pg_policies where schemaname='financial_app'
       and tablename='workspace_deletion_runtime_policy'
       and policyname='workspace_deletion_runtime_policy_gateway_read'
       and cmd='SELECT' and 'financial_app_gateway'=any(roles)
     ) then
    raise exception 'control_grants_or_policy_incorrect';
  end if;

  insert into financial_app.workspaces(id,name) values(v_workspace,'Reconciliación temporal');
  perform set_config('financial_app.workspace_id',v_workspace::text,true);
  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
    values('Cuenta de prueba de conciliación','Test','checking',10000,'EUR','active',0)
    returning id into v_account;

  for v_index in 1..5 loop
    v_day := date '2099-01-01'+(v_index-1);
    v_amount := (array[1000,-250,500,-200,-300]::bigint[])[v_index];
    v_bank := (array[11000,10750,11900,null,11150]::bigint[])[v_index];
    insert into financial_app.transaction_source_records(
      source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,
      source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
    ) values (
      '__account_reconciliation_test__','one','ROW-'||v_index,
      '__account_reconciliation_test__::one::ROW-'||v_index,repeat(v_index::text,64),
      '{}'::jsonb,v_day,'PRUEBA',v_amount,v_bank,'Cuenta de prueba de conciliación'
    ) returning id into v_source;
    insert into financial_app.transactions(
      source_record_id,source_row_identity,account_id,bank_date,concept_normalized,
      kind,amount_cents,balance_after_cents,review_state,duplicate_state
    ) values (
      v_source,'__account_reconciliation_test__::one::ROW-'||v_index,v_account,
      v_day,'PRUEBA',case when v_amount>0 then 'income' else 'expense' end,
      v_amount,v_bank,'confirmed','none'
    );
  end loop;

  v_result := financial_app.financial_account_reconciliation(v_account,'2099-01-05',12);
  if (v_result->>'varianceDays')::integer<>2
     or (v_result->>'anchorDays')::integer<>4
     or (v_result->>'reconstructionDeltaCents')::bigint<>400
     or (v_result->'events'->0->>'deltaCents')::bigint<>650
     or (v_result->'events'->0->>'periodStartDate')<>'2099-01-03'
     or (v_result->'events'->1->>'deltaCents')::bigint<>-250
     or (v_result->'events'->1->>'periodStartDate')<>'2099-01-04'
     or (v_result->'events'->1->>'cumulativeDeltaCents')::bigint<>400
     or (v_result->>'unanchoredMovementCents')::bigint<>0 then
    raise exception 'account_reconciliation_events_inconsistent: %',v_result;
  end if;

  v_as_of_gap := financial_app.financial_account_reconciliation(v_account,'2099-01-04',12);
  if (v_as_of_gap->>'bankBalanceDate')<>'2099-01-03'
     or (v_as_of_gap->>'reconstructionDeltaCents')::bigint<>850
     or (v_as_of_gap->>'unanchoredMovementCents')::bigint<>-200
     or (v_as_of_gap->>'varianceDays')::integer<>1 then
    raise exception 'unanchored_movements_not_visible: %',v_as_of_gap;
  end if;
end $$;

set local role financial_app_gateway;
do $$
begin
  if (select count(*) from financial_app.workspace_deletion_runtime_policy where id=true)<>1 then
    raise exception 'gateway_policy_not_readable';
  end if;
end $$;
reset role;

rollback;
