begin;

-- Fase 5: fuente única de hechos financieros efectivos.
-- Las decisiones manuales de F4 se respetan aquí, pero nunca se reescribe la fuente bancaria.
create or replace function financial_app.financial_transaction_facts()
returns table(
  transaction_id uuid,
  account_id uuid,
  bank_date date,
  amount_cents bigint,
  effective_kind text,
  effective_category_id uuid,
  effective_merchant_id uuid,
  duplicate_state text,
  transfer_pair_id uuid,
  excluded_from_analytics boolean,
  analytics_eligible boolean,
  sign_mismatch boolean
)
language sql
stable
set search_path = ''
as $$
  select
    t.id,
    t.account_id,
    t.bank_date,
    t.amount_cents,
    financial_app.effective_transaction_kind(t.id,t.kind,o.kind_override,t.transfer_pair_id) as effective_kind,
    case
      when o.id is null then t.category_id
      when coalesce(o.category_override_set,false) then o.category_id_override
      else coalesce(o.category_id_override,t.category_id)
    end as effective_category_id,
    case
      when o.id is null then t.merchant_id
      when coalesce(o.merchant_override_set,false) then o.merchant_id_override
      else coalesce(o.merchant_id_override,t.merchant_id)
    end as effective_merchant_id,
    t.duplicate_state,
    t.transfer_pair_id,
    coalesce(o.excluded_from_analytics,false) as excluded_from_analytics,
    (t.duplicate_state <> 'confirmed' and not coalesce(o.excluded_from_analytics,false)) as analytics_eligible,
    (
      (financial_app.effective_transaction_kind(t.id,t.kind,o.kind_override,t.transfer_pair_id)='income' and t.amount_cents<0)
      or
      (financial_app.effective_transaction_kind(t.id,t.kind,o.kind_override,t.transfer_pair_id)='expense' and t.amount_cents>0)
    ) as sign_mismatch
  from financial_app.transactions t
  left join financial_app.transaction_overrides o on o.transaction_id=t.id
$$;

create or replace function financial_app.financial_period_summary(
  p_date_from date default null,
  p_date_to date default null,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_date_from date := p_date_from;
  v_date_to date := p_date_to;
  v_min_date date;
  v_max_date date;
  v_result jsonb;
begin
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception 'invalid_financial_date_range';
  end if;

  if p_account_id is not null and not exists(select 1 from financial_app.accounts a where a.id=p_account_id) then
    raise exception 'financial_account_not_found';
  end if;

  select min(f.bank_date),max(f.bank_date)
    into v_min_date,v_max_date
  from financial_app.financial_transaction_facts() f
  where p_account_id is null or f.account_id=p_account_id;

  v_date_from := coalesce(v_date_from,v_min_date);
  v_date_to := coalesce(v_date_to,v_max_date);

  with scoped as (
    select *
    from financial_app.financial_transaction_facts() f
    where (p_account_id is null or f.account_id=p_account_id)
      and (v_date_from is null or f.bank_date>=v_date_from)
      and (v_date_to is null or f.bank_date<=v_date_to)
  ), eligible as (
    select * from scoped where analytics_eligible
  ), metrics as (
    select
      count(*)::int as included_rows,
      coalesce(sum(amount_cents) filter (where effective_kind='income'),0)::bigint as income_cents,
      coalesce(-sum(amount_cents) filter (where effective_kind='expense'),0)::bigint as expense_cents,
      coalesce(sum(amount_cents) filter (where effective_kind='refund'),0)::bigint as refund_cents,
      coalesce(sum(amount_cents) filter (where effective_kind='adjustment'),0)::bigint as adjustment_cents,
      coalesce(sum(amount_cents) filter (where effective_kind<>'transfer'),0)::bigint as operating_net_cents,
      coalesce(sum(amount_cents) filter (where effective_kind='transfer'),0)::bigint as transfer_net_cents,
      coalesce(sum(abs(amount_cents)) filter (where effective_kind='transfer'),0)::bigint as transfer_gross_cents,
      count(*) filter (where effective_kind='transfer')::int as transfer_rows,
      count(*) filter (where effective_kind='transfer' and transfer_pair_id is not null)::int as paired_transfer_rows,
      count(*) filter (where effective_kind='transfer' and transfer_pair_id is null)::int as unpaired_transfer_rows,
      count(*) filter (where effective_kind='transfer' and transfer_pair_id is not null and transaction_id::text < transfer_pair_id::text)::int as paired_transfer_pairs,
      count(*) filter (where sign_mismatch)::int as sign_mismatch_count
    from eligible
  ), quality as (
    select
      count(*)::int as scoped_rows,
      count(*) filter (where excluded_from_analytics)::int as manually_excluded_rows,
      count(*) filter (where duplicate_state='confirmed')::int as confirmed_duplicate_rows,
      count(*) filter (where duplicate_state='suspected')::int as suspected_duplicate_rows
    from scoped
  )
  select jsonb_build_object(
    'dateFrom',v_date_from,
    'dateTo',v_date_to,
    'accountId',p_account_id,
    'incomeCents',m.income_cents,
    'expenseCents',m.expense_cents,
    'refundCents',m.refund_cents,
    'adjustmentCents',m.adjustment_cents,
    'operatingNetCents',m.operating_net_cents,
    'savingsCents',m.operating_net_cents,
    'savingsRateBps',case when m.income_cents>0 then round((m.operating_net_cents::numeric*10000)/m.income_cents)::int else null end,
    'transfers',jsonb_build_object(
      'rows',m.transfer_rows,
      'pairedRows',m.paired_transfer_rows,
      'unpairedRows',m.unpaired_transfer_rows,
      'pairedPairs',m.paired_transfer_pairs,
      'netCents',m.transfer_net_cents,
      'grossCents',m.transfer_gross_cents
    ),
    'quality',jsonb_build_object(
      'scopedRows',q.scoped_rows,
      'includedRows',m.included_rows,
      'manuallyExcludedRows',q.manually_excluded_rows,
      'confirmedDuplicateRows',q.confirmed_duplicate_rows,
      'suspectedDuplicateRows',q.suspected_duplicate_rows,
      'signMismatchRows',m.sign_mismatch_count
    )
  ) into v_result
  from metrics m cross join quality q;

  return coalesce(v_result,jsonb_build_object(
    'dateFrom',v_date_from,'dateTo',v_date_to,'accountId',p_account_id,
    'incomeCents',0,'expenseCents',0,'refundCents',0,'adjustmentCents',0,
    'operatingNetCents',0,'savingsCents',0,'savingsRateBps',null,
    'transfers',jsonb_build_object('rows',0,'pairedRows',0,'unpairedRows',0,'pairedPairs',0,'netCents',0,'grossCents',0),
    'quality',jsonb_build_object('scopedRows',0,'includedRows',0,'manuallyExcludedRows',0,'confirmedDuplicateRows',0,'suspectedDuplicateRows',0,'signMismatchRows',0)
  ));
end;
$$;

create or replace function financial_app.financial_account_balances(
  p_as_of_date date default null,
  p_include_archived boolean default false
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
  if v_as_of_date is null then
    select max(t.bank_date) into v_as_of_date from financial_app.transactions t;
  end if;

  with selected_accounts as (
    select a.*
    from financial_app.accounts a
    where coalesce(p_include_archived,false) or a.lifecycle='active'
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

create or replace function financial_app.financial_monthly_series(
  p_date_from date default null,
  p_date_to date default null,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_date_from date := p_date_from;
  v_date_to date := p_date_to;
  v_min_date date;
  v_max_date date;
  v_result jsonb;
begin
  if p_date_from is not null and p_date_to is not null and p_date_from>p_date_to then
    raise exception 'invalid_financial_date_range';
  end if;
  if p_account_id is not null and not exists(select 1 from financial_app.accounts a where a.id=p_account_id) then
    raise exception 'financial_account_not_found';
  end if;

  select min(f.bank_date),max(f.bank_date) into v_min_date,v_max_date
  from financial_app.financial_transaction_facts() f
  where p_account_id is null or f.account_id=p_account_id;
  v_date_from:=coalesce(v_date_from,v_min_date);
  v_date_to:=coalesce(v_date_to,v_max_date);

  if v_date_from is null or v_date_to is null then
    return jsonb_build_object('dateFrom',v_date_from,'dateTo',v_date_to,'accountId',p_account_id,'rows','[]'::jsonb);
  end if;

  with months as (
    select generate_series(date_trunc('month',v_date_from::timestamp),date_trunc('month',v_date_to::timestamp),interval '1 month')::date as month_start
  ), eligible as (
    select f.*
    from financial_app.financial_transaction_facts() f
    where f.analytics_eligible
      and (p_account_id is null or f.account_id=p_account_id)
      and f.bank_date>=v_date_from and f.bank_date<=v_date_to
  ), grouped as (
    select date_trunc('month',e.bank_date::timestamp)::date as month_start,
      count(*)::int as rows,
      coalesce(sum(e.amount_cents) filter (where e.effective_kind='income'),0)::bigint as income_cents,
      coalesce(-sum(e.amount_cents) filter (where e.effective_kind='expense'),0)::bigint as expense_cents,
      coalesce(sum(e.amount_cents) filter (where e.effective_kind='refund'),0)::bigint as refund_cents,
      coalesce(sum(e.amount_cents) filter (where e.effective_kind='adjustment'),0)::bigint as adjustment_cents,
      coalesce(sum(e.amount_cents) filter (where e.effective_kind<>'transfer'),0)::bigint as operating_net_cents,
      coalesce(sum(e.amount_cents) filter (where e.effective_kind='transfer'),0)::bigint as transfer_net_cents,
      coalesce(sum(abs(e.amount_cents)) filter (where e.effective_kind='transfer'),0)::bigint as transfer_gross_cents
    from eligible e
    group by 1
  )
  select jsonb_build_object(
    'dateFrom',v_date_from,
    'dateTo',v_date_to,
    'accountId',p_account_id,
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'monthStart',m.month_start,
      'rows',coalesce(g.rows,0),
      'incomeCents',coalesce(g.income_cents,0),
      'expenseCents',coalesce(g.expense_cents,0),
      'refundCents',coalesce(g.refund_cents,0),
      'adjustmentCents',coalesce(g.adjustment_cents,0),
      'operatingNetCents',coalesce(g.operating_net_cents,0),
      'savingsCents',coalesce(g.operating_net_cents,0),
      'transferNetCents',coalesce(g.transfer_net_cents,0),
      'transferGrossCents',coalesce(g.transfer_gross_cents,0)
    ) order by m.month_start),'[]'::jsonb)
  ) into v_result
  from months m left join grouped g using(month_start);

  return v_result;
end;
$$;

create or replace function financial_app.financial_snapshot(
  p_date_from date default null,
  p_date_to date default null,
  p_account_id uuid default null,
  p_include_archived boolean default false
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'contractVersion',1,
    'period',financial_app.financial_period_summary(p_date_from,p_date_to,p_account_id),
    'balances',financial_app.financial_account_balances(p_date_to,p_include_archived),
    'monthly',financial_app.financial_monthly_series(p_date_from,p_date_to,p_account_id),
    'principles',jsonb_build_object(
      'bankSource','read_only',
      'transfersExcludedFromSavings',true,
      'suspectedDuplicatesIncluded',true,
      'confirmedDuplicatesExcluded',true,
      'manualAnalyticsExclusionRespected',true,
      'explicitBankBalancePreferred',true
    )
  )
$$;

-- Los motores financieros se consumen exclusivamente mediante el gateway central.
revoke all on function financial_app.financial_transaction_facts() from public,anon,authenticated;
revoke all on function financial_app.financial_period_summary(date,date,uuid) from public,anon,authenticated;
revoke all on function financial_app.financial_account_balances(date,boolean) from public,anon,authenticated;
revoke all on function financial_app.financial_monthly_series(date,date,uuid) from public,anon,authenticated;
revoke all on function financial_app.financial_snapshot(date,date,uuid,boolean) from public,anon,authenticated;

grant execute on function financial_app.financial_transaction_facts() to service_role;
grant execute on function financial_app.financial_period_summary(date,date,uuid) to service_role;
grant execute on function financial_app.financial_account_balances(date,boolean) to service_role;
grant execute on function financial_app.financial_monthly_series(date,date,uuid) to service_role;
grant execute on function financial_app.financial_snapshot(date,date,uuid,boolean) to service_role;

update financial_app.schema_meta
set schema_version=14,updated_at=now()
where id=true;

commit;
