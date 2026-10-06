
begin;

-- Financial App 10.0.83 · Axioma §25
-- Repartos compartidos/multicategoría sin reescribir la fuente bancaria.
-- Cada línea conserva el importe firmado y una instantánea del importe bancario
-- que permite detectar revisiones posteriores de la fuente sin perder el reparto.

create table if not exists financial_app.transaction_split_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default financial_app.require_current_workspace_id(),
  transaction_id uuid not null,
  position integer not null,
  allocation_scope text not null,
  amount_cents bigint not null,
  source_amount_cents bigint not null,
  category_id uuid null,
  label text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_split_allocations_position_check check (position between 0 and 19),
  constraint transaction_split_allocations_scope_check check (allocation_scope in ('personal','other')),
  constraint transaction_split_allocations_amount_check check (
    amount_cents <> 0
    and amount_cents between -9007199254740991::bigint and 9007199254740991::bigint
  ),
  constraint transaction_split_allocations_source_amount_check check (
    source_amount_cents <> 0
    and source_amount_cents between -9007199254740991::bigint and 9007199254740991::bigint
  ),
  constraint transaction_split_allocations_label_check check (label is null or length(label) between 1 and 80),
  constraint transaction_split_allocations_workspace_id_fkey
    foreign key (workspace_id) references financial_app.workspaces(id) on delete restrict,
  constraint transaction_split_allocations_transaction_workspace_fkey
    foreign key (workspace_id, transaction_id)
    references financial_app.transactions(workspace_id, id) on delete cascade,
  constraint transaction_split_allocations_category_workspace_fkey
    foreign key (workspace_id, category_id)
    references financial_app.categories(workspace_id, id) on delete set null (category_id),
  constraint transaction_split_allocations_workspace_transaction_position_key
    unique (workspace_id, transaction_id, position)
);

create unique index if not exists transaction_split_allocations_workspace_id_unique
  on financial_app.transaction_split_allocations(workspace_id,id);
create index if not exists transaction_split_allocations_workspace_transaction_idx
  on financial_app.transaction_split_allocations(workspace_id,transaction_id);
create index if not exists transaction_split_allocations_workspace_category_idx
  on financial_app.transaction_split_allocations(workspace_id,category_id);

alter table financial_app.transaction_split_allocations enable row level security;

drop policy if exists transaction_split_allocations_workspace_isolation
  on financial_app.transaction_split_allocations;
create policy transaction_split_allocations_workspace_isolation
  on financial_app.transaction_split_allocations
  for all
  to financial_app_gateway
  using (workspace_id = financial_app.require_current_workspace_id())
  with check (workspace_id = financial_app.require_current_workspace_id());

revoke all on financial_app.transaction_split_allocations from public,anon,authenticated;
grant select,insert,update,delete on financial_app.transaction_split_allocations to financial_app_gateway;
grant select,insert,update,delete on financial_app.transaction_split_allocations to service_role;

create or replace function financial_app.validate_transaction_split_allocations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transaction_id uuid := coalesce(new.transaction_id, old.transaction_id);
  v_count integer;
  v_source_count integer;
  v_source_amount bigint;
  v_sum bigint;
  v_wrong_sign integer;
  v_kind text;
begin
  select
    count(*)::integer,
    count(distinct s.source_amount_cents)::integer,
    min(s.source_amount_cents)::bigint,
    coalesce(sum(s.amount_cents),0)::bigint,
    count(*) filter (
      where (s.source_amount_cents > 0 and s.amount_cents <= 0)
         or (s.source_amount_cents < 0 and s.amount_cents >= 0)
    )::integer
  into v_count,v_source_count,v_source_amount,v_sum,v_wrong_sign
  from financial_app.transaction_split_allocations s
  where s.transaction_id=v_transaction_id;

  if v_count = 0 then
    return null;
  end if;
  if v_count < 2 or v_count > 20 then
    raise exception 'transaction_split_requires_2_to_20_allocations';
  end if;
  if v_source_count <> 1 or v_source_amount is null then
    raise exception 'transaction_split_source_amount_inconsistent';
  end if;
  if v_sum <> v_source_amount then
    raise exception 'transaction_split_amount_mismatch';
  end if;
  if v_wrong_sign <> 0 then
    raise exception 'transaction_split_sign_mismatch';
  end if;

  select financial_app.effective_transaction_kind(t.id,t.kind,o.kind_override,t.transfer_pair_id)
  into v_kind
  from financial_app.transactions t
  left join financial_app.transaction_overrides o on o.transaction_id=t.id
  where t.id=v_transaction_id;

  if v_kind='transfer' then
    raise exception 'transaction_split_transfer_forbidden';
  end if;

  return null;
end;
$$;

drop trigger if exists transaction_split_allocations_integrity
  on financial_app.transaction_split_allocations;
create constraint trigger transaction_split_allocations_integrity
after insert or update or delete on financial_app.transaction_split_allocations
deferrable initially deferred
for each row execute function financial_app.validate_transaction_split_allocations();

create or replace function financial_app.transaction_split_snapshot(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_transaction_id is null then raise exception 'invalid_transaction_id'; end if;

  with tx as (
    select
      t.id,
      t.amount_cents as bank_amount_cents,
      financial_app.effective_transaction_kind(t.id,t.kind,o.kind_override,t.transfer_pair_id) as effective_kind,
      case
        when o.id is null then t.category_id
        when coalesce(o.category_override_set,false) then o.category_id_override
        else coalesce(o.category_id_override,t.category_id)
      end as base_category_id
    from financial_app.transactions t
    left join financial_app.transaction_overrides o on o.transaction_id=t.id
    where t.id=p_transaction_id
  ), split_stats as (
    select
      count(s.id)::integer as allocation_count,
      min(s.source_amount_cents)::bigint as source_amount_cents,
      coalesce(sum(s.amount_cents) filter (where s.allocation_scope='personal'),0)::bigint as personal_amount_cents,
      coalesce(sum(s.amount_cents) filter (where s.allocation_scope='other'),0)::bigint as other_amount_cents
    from tx
    left join financial_app.transaction_split_allocations s on s.transaction_id=tx.id
  ), lines as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,
      'position',s.position,
      'scope',s.allocation_scope,
      'amountCents',s.amount_cents,
      'categoryId',s.category_id,
      'effectiveCategoryId',coalesce(s.category_id,tx.base_category_id),
      'categoryName',financial_app.category_display_name(coalesce(s.category_id,tx.base_category_id)),
      'inheritsCategory',s.category_id is null,
      'label',s.label
    ) order by s.position,s.id),'[]'::jsonb) as allocations
    from tx
    join financial_app.transaction_split_allocations s on s.transaction_id=tx.id
  ), category_stats as (
    select count(distinct coalesce(s.category_id,tx.base_category_id)) filter (
      where s.allocation_scope='personal'
    )::integer as category_count
    from tx
    left join financial_app.transaction_split_allocations s on s.transaction_id=tx.id
  )
  select jsonb_build_object(
    'exists',coalesce(st.allocation_count,0)>0,
    'active',coalesce(st.allocation_count,0)>0
      and st.source_amount_cents=tx.bank_amount_cents
      and tx.effective_kind<>'transfer',
    'stale',coalesce(st.allocation_count,0)>0
      and (st.source_amount_cents is distinct from tx.bank_amount_cents or tx.effective_kind='transfer'),
    'canSplit',tx.bank_amount_cents<>0 and tx.effective_kind<>'transfer',
    'bankAmountCents',tx.bank_amount_cents,
    'sourceAmountCents',st.source_amount_cents,
    'personalAmountCents',case when coalesce(st.allocation_count,0)=0 then tx.bank_amount_cents else st.personal_amount_cents end,
    'otherAmountCents',case when coalesce(st.allocation_count,0)=0 then 0 else st.other_amount_cents end,
    'allocationCount',coalesce(st.allocation_count,0),
    'categoryCount',coalesce(cs.category_count,0),
    'effectiveKind',tx.effective_kind,
    'baseCategoryId',tx.base_category_id,
    'allocations',coalesce(l.allocations,'[]'::jsonb)
  )
  into v_result
  from tx
  cross join split_stats st
  cross join category_stats cs
  left join lines l on true;

  if v_result is null then raise exception 'transaction_not_found'; end if;
  return v_result;
end;
$$;

create or replace function financial_app.save_transaction_split(
  p_transaction_id uuid,
  p_allocations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction financial_app.transactions%rowtype;
  v_kind text;
  v_count integer;
  v_item jsonb;
  v_position integer;
  v_amount numeric;
  v_amount_bigint bigint;
  v_scope text;
  v_category_id uuid;
  v_label text;
  v_sum numeric := 0;
  v_new_allocations jsonb := '[]'::jsonb;
  v_old_allocations jsonb := '[]'::jsonb;
  v_old_source bigint;
  v_old_value jsonb;
  v_new_value jsonb;
  v_unknown_key text;
begin
  if p_transaction_id is null then raise exception 'invalid_transaction_id'; end if;
  if p_allocations is null or jsonb_typeof(p_allocations)<>'array' then
    raise exception 'invalid_transaction_split';
  end if;

  select * into v_transaction
  from financial_app.transactions
  where id=p_transaction_id
  for update;
  if not found then raise exception 'transaction_not_found'; end if;

  select financial_app.effective_transaction_kind(
    v_transaction.id,v_transaction.kind,o.kind_override,v_transaction.transfer_pair_id
  )
  into v_kind
  from (select 1) x
  left join financial_app.transaction_overrides o on o.transaction_id=v_transaction.id;

  v_count := jsonb_array_length(p_allocations);
  if v_count<>0 and (v_count<2 or v_count>20) then
    raise exception 'transaction_split_requires_2_to_20_allocations';
  end if;
  if v_count>0 and v_transaction.amount_cents=0 then
    raise exception 'transaction_split_zero_amount_forbidden';
  end if;
  if v_count>0 and v_kind='transfer' then
    raise exception 'transaction_split_transfer_forbidden';
  end if;

  if v_count>0 then
    v_position := 0;
    for v_item in select value from jsonb_array_elements(p_allocations) loop
      if jsonb_typeof(v_item)<>'object' then raise exception 'invalid_transaction_split_allocation'; end if;

      select key into v_unknown_key
      from jsonb_object_keys(v_item) as key
      where key not in ('amountCents','scope','categoryId','label')
      limit 1;
      if v_unknown_key is not null then
        raise exception 'unsupported_transaction_split_field_%',v_unknown_key;
      end if;

      if not (v_item ? 'amountCents') or jsonb_typeof(v_item->'amountCents')<>'number' then
        raise exception 'invalid_transaction_split_amount';
      end if;
      v_amount := (v_item->>'amountCents')::numeric;
      if trunc(v_amount)<>v_amount
         or v_amount=0
         or v_amount < -9007199254740991::numeric
         or v_amount > 9007199254740991::numeric then
        raise exception 'invalid_transaction_split_amount';
      end if;
      v_amount_bigint := v_amount::bigint;
      if (v_transaction.amount_cents>0 and v_amount_bigint<=0)
         or (v_transaction.amount_cents<0 and v_amount_bigint>=0) then
        raise exception 'transaction_split_sign_mismatch';
      end if;

      if not (v_item ? 'scope') or jsonb_typeof(v_item->'scope')<>'string' then
        raise exception 'invalid_transaction_split_scope';
      end if;
      v_scope := v_item->>'scope';
      if v_scope not in ('personal','other') then raise exception 'invalid_transaction_split_scope'; end if;

      v_category_id := null;
      if v_item ? 'categoryId' and v_item->'categoryId'<>'null'::jsonb then
        if jsonb_typeof(v_item->'categoryId')<>'string'
          or (v_item->>'categoryId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          raise exception 'invalid_transaction_split_category';
        end if;
        v_category_id := (v_item->>'categoryId')::uuid;
        if not exists (
          select 1 from financial_app.categories c
          where c.id=v_category_id and c.lifecycle='active'
        ) then
          raise exception 'transaction_split_category_not_found';
        end if;
      end if;

      v_label := null;
      if v_item ? 'label' and v_item->'label'<>'null'::jsonb then
        if jsonb_typeof(v_item->'label')<>'string' then raise exception 'invalid_transaction_split_label'; end if;
        v_label := nullif(btrim(v_item->>'label'),'');
        if v_label is not null and length(v_label)>80 then raise exception 'invalid_transaction_split_label'; end if;
      end if;

      v_sum := v_sum + v_amount;
      v_new_allocations := v_new_allocations || jsonb_build_array(jsonb_build_object(
        'amountCents',v_amount_bigint,
        'scope',v_scope,
        'categoryId',v_category_id,
        'label',v_label
      ));
      v_position := v_position + 1;
    end loop;

    if v_sum<>v_transaction.amount_cents::numeric then
      raise exception 'transaction_split_amount_mismatch';
    end if;
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'amountCents',s.amount_cents,
      'scope',s.allocation_scope,
      'categoryId',s.category_id,
      'label',s.label
    ) order by s.position,s.id),'[]'::jsonb),
    min(s.source_amount_cents)::bigint
  into v_old_allocations,v_old_source
  from financial_app.transaction_split_allocations s
  where s.transaction_id=p_transaction_id;

  v_old_value := case
    when jsonb_array_length(v_old_allocations)=0 then null
    else jsonb_build_object('sourceAmountCents',v_old_source,'allocations',v_old_allocations)
  end;
  v_new_value := case
    when v_count=0 then null
    else jsonb_build_object('sourceAmountCents',v_transaction.amount_cents,'allocations',v_new_allocations)
  end;

  if v_old_value is not distinct from v_new_value then
    return financial_app.transaction_split_snapshot(p_transaction_id)
      || jsonb_build_object('changed',false,'auditChanges',0);
  end if;

  insert into financial_app.audit_changes(
    entity_type,entity_id,field_name,original_value,new_value,change_origin
  ) values (
    'transaction',p_transaction_id,'split_allocations',v_old_value,v_new_value,'user'
  );

  delete from financial_app.transaction_split_allocations
  where transaction_id=p_transaction_id;

  if v_count>0 then
    insert into financial_app.transaction_split_allocations(
      transaction_id,position,allocation_scope,amount_cents,source_amount_cents,category_id,label
    )
    select
      p_transaction_id,
      ordinality::integer-1,
      item->>'scope',
      (item->>'amountCents')::bigint,
      v_transaction.amount_cents,
      case when item->'categoryId'='null'::jsonb then null else (item->>'categoryId')::uuid end,
      case when item->'label'='null'::jsonb then null else item->>'label' end
    from jsonb_array_elements(v_new_allocations) with ordinality as normalized(item,ordinality);
  end if;

  return financial_app.transaction_split_snapshot(p_transaction_id)
    || jsonb_build_object('changed',true,'auditChanges',1);
end;
$$;

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
  with base as (
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
  ), prepared as (
    select
      b.*,
      coalesce(s.allocation_count,0)::integer as allocation_count,
      coalesce(s.personal_count,0)::integer as personal_count,
      coalesce(s.personal_amount_cents,0)::bigint as personal_amount_cents,
      coalesce(s.personal_category_count,0)::integer as personal_category_count,
      s.personal_category_key
    from base b
    left join lateral (
      select
        count(*)::integer as allocation_count,
        count(*) filter (where a.allocation_scope='personal')::integer as personal_count,
        coalesce(sum(a.amount_cents) filter (where a.allocation_scope='personal'),0)::bigint as personal_amount_cents,
        count(distinct coalesce(coalesce(a.category_id,b.base_category_id)::text,'__none__'))
          filter (where a.allocation_scope='personal')::integer as personal_category_count,
        min(coalesce(coalesce(a.category_id,b.base_category_id)::text,'__none__'))
          filter (where a.allocation_scope='personal') as personal_category_key
      from financial_app.transaction_split_allocations a
      where a.transaction_id=b.id
        and a.source_amount_cents=b.bank_amount_cents
        and b.effective_kind<>'transfer'
    ) s on true
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
security invoker
set search_path = ''
as $$
  select * from financial_app.financial_transaction_facts(null,null,null)
$$;

create or replace function financial_app.financial_transaction_allocation_facts(
  p_date_from date,
  p_date_to date,
  p_account_id uuid
)
returns table(
  transaction_id uuid,
  allocation_id uuid,
  allocation_position integer,
  allocation_label text,
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
  sign_mismatch boolean,
  split_active boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with facts as (
    select *
    from financial_app.financial_transaction_facts(p_date_from,p_date_to,p_account_id)
  ), base as (
    select
      f.*,
      t.amount_cents as bank_amount_cents,
      case
        when o.id is null then t.category_id
        when coalesce(o.category_override_set,false) then o.category_id_override
        else coalesce(o.category_id_override,t.category_id)
      end as base_category_id
    from facts f
    join financial_app.transactions t on t.id=f.transaction_id
    left join financial_app.transaction_overrides o on o.transaction_id=t.id
  ), split_rows as (
    select
      b.transaction_id,
      a.id as allocation_id,
      a.position as allocation_position,
      a.label as allocation_label,
      b.account_id,
      b.bank_date,
      a.amount_cents,
      b.effective_kind,
      coalesce(a.category_id,b.base_category_id) as effective_category_id,
      b.effective_merchant_id,
      b.duplicate_state,
      b.transfer_pair_id,
      b.excluded_from_analytics,
      b.analytics_eligible,
      (
        (b.effective_kind='income' and a.amount_cents<0)
        or
        (b.effective_kind='expense' and a.amount_cents>0)
      ) as sign_mismatch,
      true as split_active
    from base b
    join financial_app.transaction_split_allocations a
      on a.transaction_id=b.transaction_id
     and a.source_amount_cents=b.bank_amount_cents
     and a.allocation_scope='personal'
    where b.effective_kind<>'transfer'
  ), unsplit_rows as (
    select
      b.transaction_id,
      null::uuid as allocation_id,
      null::integer as allocation_position,
      null::text as allocation_label,
      b.account_id,
      b.bank_date,
      b.amount_cents,
      b.effective_kind,
      b.effective_category_id,
      b.effective_merchant_id,
      b.duplicate_state,
      b.transfer_pair_id,
      b.excluded_from_analytics,
      b.analytics_eligible,
      b.sign_mismatch,
      false as split_active
    from base b
    where not exists (
      select 1
      from financial_app.transaction_split_allocations a
      where a.transaction_id=b.transaction_id
        and a.source_amount_cents=b.bank_amount_cents
        and b.effective_kind<>'transfer'
    )
  )
  select * from split_rows
  union all
  select * from unsplit_rows
$$;

create or replace function financial_app.financial_transaction_allocation_facts()
returns table(
  transaction_id uuid,
  allocation_id uuid,
  allocation_position integer,
  allocation_label text,
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
  sign_mismatch boolean,
  split_active boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from financial_app.financial_transaction_allocation_facts(null,null,null)
$$;

create or replace function financial_app.budget_month_actual(
  p_month text,
  p_category_id uuid default null
)
returns bigint
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_kind text;
  v_result bigint;
begin
  v_start := financial_app.budget_month_start(p_month);
  v_end := (v_start + interval '1 month - 1 day')::date;

  if p_category_id is not null then
    select c.kind into v_kind from financial_app.categories c where c.id=p_category_id;
    if v_kind is null then raise exception 'budget_category_not_found'; end if;
    if v_kind<>'expense' then raise exception 'budget_category_must_be_expense'; end if;
  end if;

  select coalesce(-sum(f.amount_cents),0)::bigint
  into v_result
  from financial_app.financial_transaction_allocation_facts(v_start,v_end,null) f
  where f.analytics_eligible
    and f.effective_kind='expense'
    and (
      p_category_id is null
      or f.effective_category_id in (
        select s.category_id from financial_app.budget_category_scope(p_category_id) s
      )
    );

  return coalesce(v_result,0);
end;
$$;

create or replace function financial_app.budget_month_recommendation(
  p_month text,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_history_start date;
  v_history_end date;
  v_kind text;
  v_available_month_count integer := 0;
  v_trailing3 bigint := 0;
  v_recent_weighted bigint := 0;
  v_seasonal bigint := 0;
  v_seasonal_count integer := 0;
  v_trend_adjustment bigint := 0;
  v_known_recurring bigint := 0;
  v_extraordinary_count integer := 0;
  v_extraordinary_cap bigint := null;
  v_model_amount bigint := 0;
  v_amount bigint := 0;
  v_history jsonb := '[]'::jsonb;
  v_mode text := 'fallback_3_month_average';
  v_explanation text;
begin
  v_start := financial_app.budget_month_start(p_month);
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_history_start := (v_start - interval '36 months')::date;
  v_history_end := (v_start - interval '1 day')::date;

  if p_category_id is not null then
    select c.kind into v_kind
    from financial_app.categories c
    where c.id = p_category_id;

    if v_kind is null then raise exception 'budget_category_not_found'; end if;
    if v_kind <> 'expense' then raise exception 'budget_category_must_be_expense'; end if;
  end if;

  with facts as (
    select f.bank_date, f.amount_cents
    from financial_app.financial_transaction_allocation_facts(v_history_start, v_history_end, null) f
    where f.analytics_eligible
      and f.effective_kind = 'expense'
      and (
        p_category_id is null
        or f.effective_category_id in (
          select s.category_id
          from financial_app.budget_category_scope(p_category_id) s
        )
      )
  ), bounds as (
    select date_trunc('month', min(bank_date))::date as first_month
    from facts
  ), months as (
    select g::date as month_start
    from bounds b
    cross join lateral generate_series(
      greatest(coalesce(b.first_month, (v_start - interval '3 months')::date), v_history_start),
      (v_start - interval '1 month')::date,
      interval '1 month'
    ) g
  ), monthly_raw as (
    select
      m.month_start,
      coalesce(-sum(f.amount_cents), 0)::bigint as expense_cents
    from months m
    left join facts f
      on f.bank_date >= m.month_start
     and f.bank_date < (m.month_start + interval '1 month')::date
    group by m.month_start
  ), robust_stats as (
    select
      count(*) filter (where expense_cents > 0)::integer as positive_months,
      percentile_cont(0.25) within group (order by expense_cents) filter (where expense_cents > 0) as q1,
      percentile_cont(0.75) within group (order by expense_cents) filter (where expense_cents > 0) as q3
    from monthly_raw
  ), normalized as (
    select
      r.month_start,
      r.expense_cents,
      case
        when s.positive_months >= 6
         and s.q1 is not null
         and s.q3 is not null
        then greatest(
          0::numeric,
          s.q3 + (1.5 * (s.q3 - s.q1))
        )
        else null
      end as extraordinary_cap_numeric
    from monthly_raw r
    cross join robust_stats s
  ), adjusted as (
    select
      month_start,
      expense_cents,
      case
        when extraordinary_cap_numeric is not null
          then least(expense_cents::numeric, extraordinary_cap_numeric)::bigint
        else expense_cents
      end as adjusted_expense_cents,
      extraordinary_cap_numeric,
      extraordinary_cap_numeric is not null
        and expense_cents::numeric > extraordinary_cap_numeric as extraordinary
    from normalized
  ), aggregates as (
    select
      count(*)::integer as available_month_count,
      coalesce(round(avg(expense_cents::numeric) filter (
        where month_start >= (v_start - interval '3 months')::date
      )), 0)::bigint as trailing3,
      coalesce(round(
        sum(
          adjusted_expense_cents::numeric *
          greatest(1, 7 - (
            (extract(year from v_start)::integer - extract(year from month_start)::integer) * 12
            + extract(month from v_start)::integer - extract(month from month_start)::integer
          ))
        ) filter (where month_start >= (v_start - interval '6 months')::date)
        /
        nullif(sum(
          greatest(1, 7 - (
            (extract(year from v_start)::integer - extract(year from month_start)::integer) * 12
            + extract(month from v_start)::integer - extract(month from month_start)::integer
          ))
        ) filter (where month_start >= (v_start - interval '6 months')::date), 0)
      ), 0)::bigint as recent_weighted,
      coalesce(round(avg(adjusted_expense_cents::numeric) filter (
        where month_start >= (v_start - interval '3 months')::date
      )), 0)::bigint as recent3,
      coalesce(round(avg(adjusted_expense_cents::numeric) filter (
        where month_start >= (v_start - interval '6 months')::date
          and month_start < (v_start - interval '3 months')::date
      )), 0)::bigint as previous3,
      count(*) filter (where extraordinary)::integer as extraordinary_count,
      max(extraordinary_cap_numeric)::bigint as extraordinary_cap
    from adjusted
  ), seasonal as (
    select
      coalesce(round(
        sum(
          adjusted_expense_cents::numeric * greatest(
            1,
            4 - (extract(year from v_start)::integer - extract(year from month_start)::integer)
          )
        ) /
        nullif(sum(greatest(
          1,
          4 - (extract(year from v_start)::integer - extract(year from month_start)::integer)
        )), 0)
      ), 0)::bigint as seasonal_amount,
      count(*)::integer as seasonal_count
    from adjusted
    where extract(month from month_start) = extract(month from v_start)
      and month_start <= (v_start - interval '12 months')::date
      and month_start >= (v_start - interval '36 months')::date
  ), last_three as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'month', to_char(month_start, 'YYYY-MM'),
          'expenseCents', expense_cents
        ) order by month_start
      ),
      '[]'::jsonb
    ) as history
    from adjusted
    where month_start >= (v_start - interval '3 months')::date
  )
  select
    a.available_month_count,
    a.trailing3,
    a.recent_weighted,
    s.seasonal_amount,
    s.seasonal_count,
    case
      when a.available_month_count >= 6
       and a.previous3 > 0
       and a.recent_weighted > 0
      then greatest(
        -round(a.recent_weighted::numeric * 0.20)::bigint,
        least(
          round(a.recent_weighted::numeric * 0.20)::bigint,
          round((a.recent3 - a.previous3)::numeric * 0.35)::bigint
        )
      )
      else 0::bigint
    end,
    a.extraordinary_count,
    a.extraordinary_cap,
    l.history
  into
    v_available_month_count,
    v_trailing3,
    v_recent_weighted,
    v_seasonal,
    v_seasonal_count,
    v_trend_adjustment,
    v_extraordinary_count,
    v_extraordinary_cap,
    v_history
  from aggregates a
  cross join seasonal s
  cross join last_three l;

  -- Recurrentes conocidos se usan como suelo, no como suma, para no contar dos veces
  -- obligaciones que normalmente ya están presentes en el histórico.
  with recurring_occurrences as (
    select
      r.id,
      r.category_id,
      r.usual_amount_cents,
      case
        when r.interval_unit = 'week'
          then r.next_estimated_date + ((7 * r.interval_count * g.n)::integer)
        when r.interval_unit = 'month'
          then (r.next_estimated_date + make_interval(months => r.interval_count * g.n))::date
        when r.interval_unit = 'quarter'
          then (r.next_estimated_date + make_interval(months => 3 * r.interval_count * g.n))::date
        when r.interval_unit = 'year'
          then (r.next_estimated_date + make_interval(years => r.interval_count * g.n))::date
        else null::date
      end as occurrence_date
    from financial_app.recurrences r
    cross join generate_series(0, 180) as g(n)
    where r.status = 'active'
      and r.next_estimated_date is not null
      and r.usual_amount_cents < 0
      and r.interval_count > 0
      and r.interval_unit in ('week','month','quarter','year')
      and r.next_estimated_date <= v_end
      and (
        p_category_id is null
        or r.category_id in (
          select s.category_id
          from financial_app.budget_category_scope(p_category_id) s
        )
      )
  )
  select coalesce(sum(-usual_amount_cents), 0)::bigint
  into v_known_recurring
  from recurring_occurrences
  where occurrence_date between v_start and v_end;

  if v_available_month_count < 6 then
    v_mode := 'fallback_3_month_average';
    v_model_amount := coalesce(v_trailing3, 0);
  else
    v_mode := 'axioma_52_weighted';
    v_model_amount := case
      when v_seasonal_count > 0 and v_recent_weighted > 0 then
        round((v_recent_weighted::numeric * 0.75) + (v_seasonal::numeric * 0.25))::bigint
      when v_seasonal_count > 0 then v_seasonal
      else v_recent_weighted
    end;
    v_model_amount := greatest(0, v_model_amount + v_trend_adjustment);
  end if;

  v_amount := greatest(coalesce(v_model_amount, 0), coalesce(v_known_recurring, 0));

  if v_mode = 'fallback_3_month_average' then
    v_explanation := 'Referencia automática basada en la media del gasto elegible de los 3 meses completos anteriores mientras todavía no existe profundidad histórica suficiente. Transferencias, duplicados confirmados y movimientos excluidos de analítica no consumen presupuesto.';
  else
    v_explanation := 'Referencia automática Axioma §52: pondera más los meses recientes, incorpora el mismo mes de otros años cuando existe, aplica una tendencia limitada, reduce el peso de meses extraordinarios y respeta como suelo los recurrentes activos conocidos. Transferencias, duplicados confirmados y movimientos excluidos de analítica no consumen presupuesto.';
  end if;

  return jsonb_build_object(
    'automaticAmountCents', coalesce(v_amount, 0),
    'historyMonths', coalesce(v_history, '[]'::jsonb),
    'historyMonthCount', jsonb_array_length(coalesce(v_history, '[]'::jsonb)),
    'historyDateFrom', greatest(v_history_start, (v_start - interval '3 months')::date),
    'historyDateTo', v_history_end,
    'explanation', v_explanation,
    'factors', jsonb_build_object(
      'algorithm', 'axioma_52_budget_reference_v1',
      'mode', v_mode,
      'availableMonthCount', coalesce(v_available_month_count, 0),
      'trailing3AverageCents', coalesce(v_trailing3, 0),
      'recentWeightedCents', coalesce(v_recent_weighted, 0),
      'seasonalSameMonthCents', coalesce(v_seasonal, 0),
      'seasonalMonthCount', coalesce(v_seasonal_count, 0),
      'trendAdjustmentCents', coalesce(v_trend_adjustment, 0),
      'knownRecurringCents', coalesce(v_known_recurring, 0),
      'extraordinaryMonthCount', coalesce(v_extraordinary_count, 0),
      'extraordinaryCapCents', v_extraordinary_cap,
      'recurrencePolicy', 'floor_not_additive',
      'exclusionsSource', 'financial_transaction_allocation_facts.analytics_eligible'
    )
  );
end;
$$;

create or replace function financial_app.budget_month_snapshot(p_month text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_total jsonb;
  v_categories jsonb;
begin
  v_start := financial_app.budget_month_start(p_month);
  v_end := (v_start + interval '1 month - 1 day')::date;

  with candidates as (
    select null::uuid as category_id
    union
    select c.id
    from financial_app.categories c
    where c.kind = 'expense' and c.lifecycle = 'active'
    union
    select b.category_id
    from financial_app.budgets b
    where b.month = p_month and b.category_id is not null
  ), prepared as (
    select
      x.category_id,
      b.id as budget_id,
      b.manual_amount_cents,
      c.name as category_name,
      c.lifecycle as category_lifecycle,
      coalesce(c.sort_order, -1) as sort_order,
      r.recommendation,
      financial_app.budget_month_actual(p_month, x.category_id) as actual_expense_cents
    from candidates x
    left join financial_app.budgets b
      on b.month = p_month
     and b.category_id is not distinct from x.category_id
    left join financial_app.categories c on c.id = x.category_id
    cross join lateral (
      select financial_app.budget_month_recommendation(p_month, x.category_id) as recommendation
    ) r
  ), projected as (
    select
      p.category_id,
      p.sort_order,
      p.category_name,
      jsonb_build_object(
        'id', p.budget_id,
        'persisted', p.budget_id is not null,
        'categoryId', p.category_id,
        'categoryName', p.category_name,
        'categoryLifecycle', p.category_lifecycle,
        'automaticAmountCents', (p.recommendation->>'automaticAmountCents')::bigint,
        'manualAmountCents', p.manual_amount_cents,
        'effectiveAmountCents', coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint),
        'actualExpenseCents', p.actual_expense_cents,
        'remainingCents', coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) - p.actual_expense_cents,
        'progressBps', case
          when coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) > 0
            then round(
              p.actual_expense_cents::numeric * 10000
              / coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint)
            )::integer
          else null
        end,
        'status', case
          when coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) = 0
               and p.actual_expense_cents = 0 then 'empty'
          when coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) = 0
               and p.actual_expense_cents > 0 then 'unfunded'
          when p.actual_expense_cents > coalesce(p.manual_amount_cents, (p.recommendation->>'automaticAmountCents')::bigint) then 'over'
          else 'on_track'
        end,
        'automaticExplanation', p.recommendation->>'explanation',
        'automaticFactors', p.recommendation->'factors',
        'historyMonths', p.recommendation->'historyMonths'
      ) as item
    from prepared p
  )
  select
    (select item from projected where category_id is null),
    coalesce(
      (select jsonb_agg(item order by sort_order, category_name, category_id)
       from projected where category_id is not null),
      '[]'::jsonb
    )
  into v_total, v_categories;

  return jsonb_build_object(
    'contractVersion', 1,
    'month', p_month,
    'monthStart', v_start,
    'monthEnd', v_end,
    'total', v_total,
    'categories', coalesce(v_categories, '[]'::jsonb),
    'principles', jsonb_build_object(
      'bankSource', 'read_only',
      'actualSource', 'financial_transaction_allocation_facts',
      'recommendation', 'axioma_52_weighted_history_seasonality_trend_recurrence_floor',
      'transfersConsumeBudget', false,
      'confirmedDuplicatesConsumeBudget', false,
      'manualAnalyticsExclusionsRespected', true,
      'refundsNetAgainstExpense', false,
      'manualOverrideWins', true,
      'parentCategoryIncludesDescendants', true
    )
  );
end;
$$;

create or replace function financial_app.query_effective_transactions(
  p_query text default null::text,
  p_account_id uuid default null::uuid,
  p_category_id uuid default null::uuid,
  p_merchant_id uuid default null::uuid,
  p_kind text default null::text,
  p_review_state text default null::text,
  p_duplicate_state text default null::text,
  p_date_from date default null::date,
  p_date_to date default null::date,
  p_cursor_bank_date date default null::date,
  p_cursor_id uuid default null::uuid,
  p_limit integer default 50,
  p_uncategorized boolean default false,
  p_sign_mismatch boolean default false
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb;
  v_limit integer := coalesce(p_limit,50);
begin
  if v_limit < 1 or v_limit > 100 then raise exception 'invalid_transaction_page_limit'; end if;
  if (p_cursor_bank_date is null) <> (p_cursor_id is null) then raise exception 'invalid_transaction_cursor'; end if;
  if p_kind is not null and p_kind not in ('income','expense','transfer','refund','adjustment') then raise exception 'invalid_transaction_kind_filter'; end if;
  if p_review_state is not null and p_review_state not in ('confirmed','pending','needs_review') then raise exception 'invalid_transaction_review_filter'; end if;
  if p_duplicate_state is not null and p_duplicate_state not in ('none','suspected','confirmed') then raise exception 'invalid_transaction_duplicate_filter'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then raise exception 'invalid_transaction_date_range'; end if;

  with effective_base as (
    select
      t.id,t.source_record_id,t.source_row_identity,t.account_id,a.name as account_name,t.bank_date,
      sr.concept_original,t.concept_normalized,coalesce(o.concept_override,t.concept_normalized) as effective_concept,
      t.merchant_id as original_merchant_id,f.effective_merchant_id,
      t.category_id as original_category_id,f.effective_category_id,
      t.kind as original_kind,f.effective_kind,t.amount_cents,t.balance_after_cents,
      t.review_state as original_review_state,coalesce(o.review_state_override,t.review_state) as effective_review_state,
      t.duplicate_state,t.transfer_pair_id,f.sign_mismatch,
      coalesce(o.excluded_from_analytics,false) as excluded_from_analytics,o.note as user_note,(o.id is not null) as has_user_override,
      coalesce(o.merchant_override_set,false) as merchant_override_set,coalesce(o.category_override_set,false) as category_override_set,
      o.merchant_id_override,o.category_id_override,o.concept_override,o.kind_override,o.review_state_override,
      sr.source_file_id,sr.source_sheet_id,sr.source_row_key,sr.source_fingerprint,sr.imported_at
    from financial_app.financial_transaction_facts(p_date_from,p_date_to,p_account_id) f
    join financial_app.transactions t on t.id=f.transaction_id
    join financial_app.transaction_source_records sr on sr.id=t.source_record_id
    join financial_app.accounts a on a.id=t.account_id
    left join financial_app.transaction_overrides o on o.transaction_id=t.id
  ), enriched as (
    select
      b.*,om.name as original_merchant_name,em.name as effective_merchant_name,
      financial_app.category_display_name(b.original_category_id) as original_category_name,
      financial_app.category_display_name(b.effective_category_id) as effective_category_name
    from effective_base b
    left join financial_app.merchants om on om.id=b.original_merchant_id
    left join financial_app.merchants em on em.id=b.effective_merchant_id
  ), filtered as (
    select * from enriched e
    where (p_account_id is null or e.account_id=p_account_id)
      and (
        p_category_id is null
        or (
          not exists (
            select 1
            from financial_app.transaction_split_allocations split_probe
            where split_probe.transaction_id=e.id
              and split_probe.source_amount_cents=e.amount_cents
          )
          and (
            e.effective_category_id=p_category_id
            or exists (
              select 1 from financial_app.categories fc
              where fc.id=e.effective_category_id and fc.parent_category_id=p_category_id
            )
          )
        )
        or exists (
          select 1
          from financial_app.transaction_split_allocations split_category
          where split_category.transaction_id=e.id
            and split_category.source_amount_cents=e.amount_cents
            and split_category.allocation_scope='personal'
            and (
              coalesce(split_category.category_id,
                case
                  when e.category_override_set then e.category_id_override
                  else coalesce(e.category_id_override,e.original_category_id)
                end
              )=p_category_id
              or exists (
                select 1
                from financial_app.categories split_parent
                where split_parent.id=coalesce(split_category.category_id,
                  case
                    when e.category_override_set then e.category_id_override
                    else coalesce(e.category_id_override,e.original_category_id)
                  end
                )
                  and split_parent.parent_category_id=p_category_id
              )
            )
        )
      )
      and (
        not coalesce(p_uncategorized,false)
        or (
          not exists (
            select 1
            from financial_app.transaction_split_allocations split_probe
            where split_probe.transaction_id=e.id
              and split_probe.source_amount_cents=e.amount_cents
          )
          and e.effective_category_id is null
        )
        or exists (
          select 1
          from financial_app.transaction_split_allocations split_uncategorized
          where split_uncategorized.transaction_id=e.id
            and split_uncategorized.source_amount_cents=e.amount_cents
            and split_uncategorized.allocation_scope='personal'
            and coalesce(split_uncategorized.category_id,
              case
                when e.category_override_set then e.category_id_override
                else coalesce(e.category_id_override,e.original_category_id)
              end
            ) is null
        )
      )
      and (not coalesce(p_sign_mismatch,false) or e.sign_mismatch)
      and (p_merchant_id is null or e.effective_merchant_id=p_merchant_id)
      and (p_kind is null or e.effective_kind=p_kind)
      and (p_review_state is null or e.effective_review_state=p_review_state)
      and (p_duplicate_state is null or e.duplicate_state=p_duplicate_state)
      and (p_date_from is null or e.bank_date>=p_date_from)
      and (p_date_to is null or e.bank_date<=p_date_to)
      and (
        nullif(pg_catalog.btrim(coalesce(p_query,'')),'') is null
        or financial_app.normalize_merchant_label(concat_ws(' ',e.effective_concept,e.concept_original,e.account_name,e.effective_merchant_name,e.effective_category_name))
          like '%' || financial_app.normalize_merchant_label(pg_catalog.btrim(p_query)) || '%'
      )
  ), after_cursor as (
    select * from filtered f
    where p_cursor_bank_date is null or (f.bank_date,f.id)<(p_cursor_bank_date,p_cursor_id)
    order by f.bank_date desc,f.id desc
    limit v_limit+1
  ), visible as (
    select * from after_cursor order by bank_date desc,id desc limit v_limit
  ), stats as (
    select
      (select count(*)::int from filtered) as total_count,
      (select count(*)::int from after_cursor)>v_limit as has_more
  ), last_visible as (
    select bank_date,id from visible order by bank_date asc,id asc limit 1
  ), rows_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',v.id,'bankDate',v.bank_date,'amountCents',v.amount_cents,'balanceAfterCents',v.balance_after_cents,
      'account',jsonb_build_object('id',v.account_id,'name',v.account_name),
      'concept',jsonb_build_object('original',v.concept_original,'processed',v.concept_normalized,'effective',v.effective_concept),
      'merchant',jsonb_build_object('originalId',v.original_merchant_id,'originalName',v.original_merchant_name,'effectiveId',v.effective_merchant_id,'effectiveName',v.effective_merchant_name),
      'category',jsonb_build_object('originalId',v.original_category_id,'originalName',v.original_category_name,'effectiveId',v.effective_category_id,'effectiveName',v.effective_category_name),
      'kind',jsonb_build_object('original',v.original_kind,'effective',v.effective_kind),
      'reviewState',jsonb_build_object('original',v.original_review_state,'effective',v.effective_review_state),
      'duplicateState',v.duplicate_state,'signMismatch',v.sign_mismatch,'transferPairId',v.transfer_pair_id,
      'excludedFromAnalytics',v.excluded_from_analytics,'userNote',v.user_note,'hasUserOverride',v.has_user_override,
      'overriddenFields',to_jsonb(array_remove(array[
        case when v.concept_override is not null then 'concept' end,
        case when v.merchant_override_set or v.merchant_id_override is not null then 'merchant' end,
        case when v.category_override_set or v.category_id_override is not null then 'category' end,
        case when v.kind_override is not null then 'kind' end,
        case when v.review_state_override is not null then 'reviewState' end,
        case when v.excluded_from_analytics then 'excludedFromAnalytics' end,
        case when v.user_note is not null then 'note' end
      ]::text[],null)),
      'source',jsonb_build_object(
        'sourceRecordId',v.source_record_id,'sourceRowIdentity',v.source_row_identity,'sourceFileId',v.source_file_id,
        'sourceSheetId',v.source_sheet_id,'sourceRowKey',v.source_row_key,'sourceFingerprint',v.source_fingerprint,'importedAt',v.imported_at
      )
    ) order by v.bank_date desc,v.id desc),'[]'::jsonb) as rows
    from visible v
  )
  select jsonb_build_object(
    'rows',r.rows,
    'totalCount',s.total_count,
    'hasMore',s.has_more,
    'nextCursor',case when s.has_more and l.id is not null then jsonb_build_object('bankDate',l.bank_date,'id',l.id) else null end
  )
  into v_result
  from stats s
  cross join rows_json r
  left join last_visible l on true;

  return v_result;
end;
$$;


revoke all on function financial_app.transaction_split_snapshot(uuid) from public,anon,authenticated;
revoke all on function financial_app.save_transaction_split(uuid,jsonb) from public,anon,authenticated;
revoke all on function financial_app.financial_transaction_allocation_facts(date,date,uuid) from public,anon,authenticated;
revoke all on function financial_app.financial_transaction_allocation_facts() from public,anon,authenticated;

grant execute on function financial_app.transaction_split_snapshot(uuid) to financial_app_gateway;
grant execute on function financial_app.save_transaction_split(uuid,jsonb) to financial_app_gateway;
grant execute on function financial_app.financial_transaction_allocation_facts(date,date,uuid) to financial_app_gateway;
grant execute on function financial_app.financial_transaction_allocation_facts() to financial_app_gateway;

grant execute on function financial_app.transaction_split_snapshot(uuid) to service_role;
grant execute on function financial_app.financial_transaction_allocation_facts(date,date,uuid) to service_role;
grant execute on function financial_app.financial_transaction_allocation_facts() to service_role;

comment on table financial_app.transaction_split_allocations is
  'Axioma §25: reparto auditable de un movimiento bancario sin modificar la fuente; source_amount_cents detecta revisiones posteriores.';
comment on function financial_app.save_transaction_split(uuid,jsonb) is
  'Guarda o elimina un reparto §25; la suma debe coincidir exactamente con el importe bancario firmado.';
comment on function financial_app.financial_transaction_allocation_facts(date,date,uuid) is
  'Hechos personales por categoría: una fila por parte personal válida; movimientos sin reparto conservan una fila sintética.';

update financial_app.schema_meta set updated_at=now() where id=true;

commit;
