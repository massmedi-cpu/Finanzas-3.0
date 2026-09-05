begin;

-- Fase 5: una cuenta archivada seleccionada explícitamente forma parte del
-- alcance aunque el agregado general siga excluyendo archivadas por defecto.
create or replace function financial_app.financial_account_balances(
  p_as_of_date date default null,
  p_include_archived boolean default false,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_as_of_date date := p_as_of_date;
  v_result jsonb;
begin
  if p_account_id is not null and not exists(
    select 1 from financial_app.accounts a where a.id=p_account_id
  ) then
    raise exception 'financial_account_not_found';
  end if;

  if v_as_of_date is null then
    select max(t.bank_date) into v_as_of_date
    from financial_app.transactions t
    where p_account_id is null or t.account_id=p_account_id;
  end if;

  with selected_accounts as (
    select a.*
    from financial_app.accounts a
    where (
      p_account_id is not null
      or coalesce(p_include_archived,false)
      or a.lifecycle='active'
    )
      and (p_account_id is null or a.id=p_account_id)
  ), calculated as (
    select
      a.id,
      a.name,
      a.type,
      a.lifecycle,
      a.currency,
      a.sort_order,
      a.opening_balance_cents,
      explicit.balance_after_cents as explicit_balance_cents,
      explicit.bank_date as explicit_balance_date,
      explicit.source_row_key as explicit_source_row_key,
      (
        a.opening_balance_cents + coalesce((
          select sum(t.amount_cents)
          from financial_app.transactions t
          where t.account_id=a.id
            and t.duplicate_state<>'confirmed'
            and (v_as_of_date is null or t.bank_date<=v_as_of_date)
        ),0)
      )::bigint as reconstructed_balance_cents
    from selected_accounts a
    left join lateral (
      select t.balance_after_cents,t.bank_date,sr.source_row_key
      from financial_app.transactions t
      join financial_app.transaction_source_records sr on sr.id=t.source_record_id
      where t.account_id=a.id
        and t.balance_after_cents is not null
        and (v_as_of_date is null or t.bank_date<=v_as_of_date)
      order by t.bank_date desc,sr.source_row_key desc,t.id desc
      limit 1
    ) explicit on true
  ), projected as (
    select c.*,
      coalesce(c.explicit_balance_cents,c.reconstructed_balance_cents)::bigint as effective_balance_cents,
      case when c.explicit_balance_cents is not null then 'bank_explicit' else 'reconstructed' end as balance_source,
      case when c.explicit_balance_cents is not null then c.explicit_balance_cents-c.reconstructed_balance_cents else null end as reconstruction_delta_cents
    from calculated c
  ), rows_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,
      'name',p.name,
      'type',p.type,
      'lifecycle',p.lifecycle,
      'currency',p.currency,
      'openingBalanceCents',p.opening_balance_cents,
      'balanceCents',p.effective_balance_cents,
      'balanceSource',p.balance_source,
      'explicitBalanceCents',p.explicit_balance_cents,
      'explicitBalanceDate',p.explicit_balance_date,
      'explicitSourceRowKey',p.explicit_source_row_key,
      'reconstructedBalanceCents',p.reconstructed_balance_cents,
      'reconstructionDeltaCents',p.reconstruction_delta_cents
    ) order by case p.lifecycle when 'active' then 0 else 1 end,p.sort_order,p.name,p.id),'[]'::jsonb) as rows
    from projected p
  ), totals as (
    select
      coalesce(sum(effective_balance_cents),0)::bigint as selected_total,
      coalesce(sum(effective_balance_cents) filter (where lifecycle='active'),0)::bigint as active_total,
      count(*)::int as selected_accounts,
      count(*) filter (where explicit_balance_cents is not null)::int as explicit_accounts,
      count(*) filter (where explicit_balance_cents is null)::int as reconstructed_accounts,
      count(*) filter (where explicit_balance_cents is not null and explicit_balance_cents<>reconstructed_balance_cents)::int as integrity_delta_accounts
    from projected
  )
  select jsonb_build_object(
    'asOfDate',v_as_of_date,
    'includeArchived',coalesce(p_include_archived,false),
    'accountId',p_account_id,
    'totalBalanceCents',t.selected_total,
    'activeBalanceCents',t.active_total,
    'quality',jsonb_build_object(
      'accounts',t.selected_accounts,
      'explicitBalanceAccounts',t.explicit_accounts,
      'reconstructedBalanceAccounts',t.reconstructed_accounts,
      'integrityDeltaAccounts',t.integrity_delta_accounts
    ),
    'accounts',r.rows
  ) into v_result
  from totals t cross join rows_json r;

  return v_result;
end;
$$;

revoke all on function financial_app.financial_account_balances(date,boolean,uuid) from public,anon,authenticated;
grant execute on function financial_app.financial_account_balances(date,boolean,uuid) to service_role;

commit;
