begin;

create temp table phase5_archived_scope_result (
  test_name text primary key,
  passed boolean not null
) on commit drop;

do $$
declare
  v_account_id uuid;
  v_default jsonb;
  v_scoped jsonb;
begin
  insert into financial_app.accounts(
    name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
  ) values (
    'Phase5 archived explicit scope','Test','other',1234,'EUR','archived',9999
  ) returning id into v_account_id;

  v_default := financial_app.financial_account_balances('2099-01-31'::date,false,null);
  v_scoped := financial_app.financial_account_balances('2099-01-31'::date,false,v_account_id);

  insert into phase5_archived_scope_result values(
    'archived-account-remains-hidden-from-default-aggregate-but-explicit-selection-is-coherent',
    not exists(
      select 1 from jsonb_array_elements(v_default->'accounts') row
      where row->>'id'=v_account_id::text
    )
    and v_scoped->>'accountId'=v_account_id::text
    and jsonb_array_length(v_scoped->'accounts')=1
    and v_scoped->'accounts'->0->>'id'=v_account_id::text
    and v_scoped->'accounts'->0->>'lifecycle'='archived'
    and (v_scoped->'accounts'->0->>'balanceCents')::bigint=1234
    and (v_scoped->>'totalBalanceCents')::bigint=1234
    and (v_scoped->'quality'->>'accounts')::int=1
  );
end $$;

do $$
begin
  if exists(select 1 from phase5_archived_scope_result where not passed) then
    raise exception 'phase5_archived_account_scope_regression';
  end if;
end $$;

select * from phase5_archived_scope_result order by test_name;

rollback;
