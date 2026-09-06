begin;

-- Fase 5: pairedPairs debe ser estable aunque el alcance solo contenga una
-- de las dos patas de una transferencia emparejada. Se cuenta la pareja por
-- su clave UUID no ordenada, no por la orientación arbitraria de los UUID.
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

  if v_date_from is null or v_date_to is null then
    select min(t.bank_date),max(t.bank_date)
      into v_min_date,v_max_date
    from financial_app.transactions t
    where p_account_id is null or t.account_id=p_account_id;
    v_date_from := coalesce(v_date_from,v_min_date);
    v_date_to := coalesce(v_date_to,v_max_date);
  end if;

  with scoped as (
    select *
    from financial_app.financial_transaction_facts(v_date_from,v_date_to,p_account_id)
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
      count(distinct case
        when effective_kind='transfer' and transfer_pair_id is not null then
          least(transaction_id::text,transfer_pair_id::text)||':'||greatest(transaction_id::text,transfer_pair_id::text)
        else null
      end)::int as paired_transfer_pairs,
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

revoke all on function financial_app.financial_period_summary(date,date,uuid) from public,anon,authenticated;
grant execute on function financial_app.financial_period_summary(date,date,uuid) to service_role;

update financial_app.schema_meta set updated_at=now() where id=true;

commit;
