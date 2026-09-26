-- Financial App · lectura trazable del saldo bancario y aislamiento de tablas de control.
-- La política de borrado es global y de solo lectura para el gateway; las otras
-- cuatro tablas de control siguen reservadas a la infraestructura.
begin;

alter table financial_app.schema_meta enable row level security;
alter table financial_app.workspaces enable row level security;
alter table financial_app.workspace_memberships enable row level security;
alter table financial_app.workspace_deletion_runtime_policy enable row level security;
alter table financial_app.workspace_deletion_receipts enable row level security;

revoke all on table financial_app.schema_meta,
  financial_app.workspaces,
  financial_app.workspace_memberships,
  financial_app.workspace_deletion_runtime_policy,
  financial_app.workspace_deletion_receipts from public, anon, authenticated;

create policy workspace_deletion_runtime_policy_gateway_read
  on financial_app.workspace_deletion_runtime_policy
  for select to financial_app_gateway using (id = true);

-- El saldo y la reconstrucción son los mismos del motor financial_account_balances.
-- Se señalan cambios en la diferencia acumulada entre anclas bancarias diarias;
-- no se infiere que exista un movimiento ausente ni se modifica la fuente.
create function financial_app.financial_account_reconciliation(
  p_account_id uuid,
  p_as_of_date date default null,
  p_limit integer default 12
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_balance jsonb;
  v_account jsonb;
  v_date date;
  v_opening bigint;
  v_events jsonb;
  v_variance_days integer;
  v_anchor_days integer;
  v_latest_delta bigint;
begin
  if p_account_id is null then
    raise exception 'invalid_reconciliation_account_id';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 30 then
    raise exception 'invalid_reconciliation_limit';
  end if;

  v_balance := financial_app.financial_account_balances(p_as_of_date,false,p_account_id);
  v_account := v_balance->'accounts'->0;
  v_date := (v_balance->>'asOfDate')::date;
  v_opening := (v_account->>'openingBalanceCents')::bigint;

  with scoped as (
    select t.id,t.bank_date,t.amount_cents,t.balance_after_cents,t.duplicate_state,sr.source_row_key
    from financial_app.transactions t
    join financial_app.transaction_source_records sr on sr.id=t.source_record_id
    where t.account_id=p_account_id and (v_date is null or t.bank_date<=v_date)
  ), movement_days as (
    select bank_date,
      coalesce(sum(amount_cents) filter (where duplicate_state<>'confirmed'),0)::bigint as movement_cents
    from scoped group by bank_date
  ), running as (
    select bank_date,movement_cents,
      sum(movement_cents) over (order by bank_date)::bigint as cumulative_movement_cents
    from movement_days
  ), anchors as (
    select distinct on (bank_date) bank_date,balance_after_cents,source_row_key
    from scoped
    where balance_after_cents is not null
    order by bank_date,source_row_key desc,id desc
  ), aligned as (
    select a.bank_date,a.balance_after_cents,a.source_row_key,
      r.cumulative_movement_cents,
      (a.balance_after_cents-v_opening-r.cumulative_movement_cents)::bigint as cumulative_delta_cents
    from anchors a join running r using (bank_date)
  ), changes as (
    select bank_date,balance_after_cents,source_row_key,cumulative_delta_cents,
      (cumulative_delta_cents-coalesce(lag(cumulative_delta_cents) over (order by bank_date),0))::bigint as delta_cents,
      coalesce(lag(bank_date) over (order by bank_date)+1,
        (select min(bank_date) from scoped)) as period_start_date
    from aligned
  ), significant as (
    select * from changes where delta_cents<>0
  ), counted as (
    select count(*)::integer as variance_days from significant
  ), ranked as (
    select * from significant order by abs(delta_cents) desc,bank_date desc limit p_limit
  )
  select coalesce((select jsonb_agg(jsonb_build_object(
      'bankDate',bank_date,
      'periodStartDate',period_start_date,
      'bankBalanceCents',balance_after_cents,
      'sourceRowKey',source_row_key,
      'deltaCents',delta_cents,
      'cumulativeDeltaCents',cumulative_delta_cents
    ) order by abs(delta_cents) desc,bank_date desc) from ranked),'[]'::jsonb),
    (select variance_days from counted),
    (select count(*)::integer from anchors),
    (select cumulative_delta_cents from aligned order by bank_date desc limit 1)
  into v_events,v_variance_days,v_anchor_days,v_latest_delta;

  return pg_catalog.jsonb_build_object(
    'contractVersion',1,
    'accountId',p_account_id,
    'asOfDate',v_date,
    'openingBalanceCents',v_opening,
    'balanceSource',v_account->>'balanceSource',
    'bankBalanceDate',v_account->>'explicitBalanceDate',
    'bankBalanceCents',v_account->'explicitBalanceCents',
    'reconstructionDeltaCents',v_account->'reconstructionDeltaCents',
    'unanchoredMovementCents',case when v_latest_delta is null then null
      else v_latest_delta-(v_account->>'reconstructionDeltaCents')::bigint end,
    'anchorDays',v_anchor_days,
    'varianceDays',v_variance_days,
    'events',v_events
  );
end;
$$;

revoke all on function financial_app.financial_account_reconciliation(uuid,date,integer)
  from public,anon,authenticated;
grant execute on function financial_app.financial_account_reconciliation(uuid,date,integer)
  to financial_app_gateway,service_role;

commit;
