-- AP6: replace per-row split probes with one scoped allocation aggregate.
-- Preserve personal/other portions, stale-source checks, zero exclusions,
-- category inheritance, transfer rules, SECURITY INVOKER, ACL and RLS.
begin;

create or replace function financial_app.financial_transaction_facts(
  p_date_from date,
  p_date_to date,
  p_account_id uuid
)
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
security invoker
set search_path = ''
as $$
  with base as materialized (
    select
      t.id,
      t.account_id,
      t.bank_date,
      t.amount_cents as bank_amount_cents,
      t.duplicate_state,
      t.transfer_pair_id,
      financial_app.effective_transaction_kind(t.id,t.kind,o.kind_override,t.transfer_pair_id) as effective_kind,
      case
        when o.id is null then t.category_id
        when coalesce(o.category_override_set,false) then o.category_id_override
        else coalesce(o.category_id_override,t.category_id)
      end as base_category_id,
      case
        when o.id is null then t.merchant_id
        when coalesce(o.merchant_override_set,false) then o.merchant_id_override
        else coalesce(o.merchant_id_override,t.merchant_id)
      end as effective_merchant_id,
      coalesce(o.excluded_from_analytics,false) as excluded_from_analytics
    from financial_app.transactions t
    left join financial_app.transaction_overrides o on o.transaction_id=t.id
    where (p_account_id is null or t.account_id=p_account_id)
      and (p_date_from is null or t.bank_date>=p_date_from)
      and (p_date_to is null or t.bank_date<=p_date_to)
  ), split_totals as materialized (
    -- Aggregate only applicable allocations once for this date/account scope.
    -- No per-movement lateral aggregate is needed for unsplit bank history.
    select
      a.transaction_id,
      count(*)::integer as allocation_count,
      count(*) filter (where a.allocation_scope='personal')::integer as personal_count,
      coalesce(sum(a.amount_cents) filter (where a.allocation_scope='personal'),0)::bigint as personal_amount_cents,
      count(distinct coalesce(coalesce(a.category_id,b.base_category_id)::text,'__none__'))
        filter (where a.allocation_scope='personal')::integer as personal_category_count,
      min(coalesce(coalesce(a.category_id,b.base_category_id)::text,'__none__'))
        filter (where a.allocation_scope='personal') as personal_category_key
    from financial_app.transaction_split_allocations a
    join base b on b.id=a.transaction_id and a.source_amount_cents=b.bank_amount_cents
    where b.effective_kind<>'transfer'
    group by a.transaction_id
  ), prepared as (
    select
      b.*,
      coalesce(s.allocation_count,0)::integer as allocation_count,
      coalesce(s.personal_count,0)::integer as personal_count,
      coalesce(s.personal_amount_cents,0)::bigint as personal_amount_cents,
      coalesce(s.personal_category_count,0)::integer as personal_category_count,
      s.personal_category_key
    from base b
    left join split_totals s on s.transaction_id=b.id
  ), projected as (
    select
      p.*,
      case when p.allocation_count>0 then p.personal_amount_cents else p.bank_amount_cents end::bigint as effective_amount_cents,
      case
        when p.allocation_count=0 then p.base_category_id
        when p.personal_count=0 then null
        when p.personal_category_count=1 and p.personal_category_key<>'__none__'
          then p.personal_category_key::uuid
        else null
      end as projected_category_id
    from prepared p
  )
  select
    p.id,
    p.account_id,
    p.bank_date,
    p.effective_amount_cents,
    p.effective_kind,
    p.projected_category_id,
    p.effective_merchant_id,
    p.duplicate_state,
    p.transfer_pair_id,
    p.excluded_from_analytics,
    (
      p.duplicate_state<>'confirmed'
      and not p.excluded_from_analytics
      and not (p.allocation_count>0 and p.effective_amount_cents=0)
    ) as analytics_eligible,
    (
      (p.effective_kind='income' and p.effective_amount_cents<0)
      or
      (p.effective_kind='expense' and p.effective_amount_cents>0)
    ) as sign_mismatch
  from projected p
$$;

commit;
