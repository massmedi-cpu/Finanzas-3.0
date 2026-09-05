-- Financial App · Fase 4 / Bloque 13
-- Motor central de revisión de duplicados y emparejado de transferencias internas.
-- La fuente bancaria permanece inmutable: estas decisiones viven en la capa derivada/personal.

create table if not exists financial_app.transaction_duplicate_reviews (
  transaction_id uuid primary key references financial_app.transactions(id) on delete cascade,
  decision text not null check (decision in ('confirmed','dismissed')),
  reviewed_source_record_id uuid not null references financial_app.transaction_source_records(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transaction_duplicate_reviews_source_idx
  on financial_app.transaction_duplicate_reviews(reviewed_source_record_id);

create or replace function financial_app.recompute_duplicate_signature(
  p_account_id uuid,
  p_bank_date date,
  p_amount_cents bigint,
  p_concept_normalized text
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_matches integer;
  v_changed integer := 0;
begin
  if p_account_id is null or p_bank_date is null or p_concept_normalized is null then
    raise exception 'invalid_duplicate_signature';
  end if;

  select count(*)::int
  into v_matches
  from financial_app.transactions t
  where t.account_id=p_account_id
    and t.bank_date=p_bank_date
    and t.amount_cents=p_amount_cents
    and financial_app.normalize_label(t.concept_normalized)=financial_app.normalize_label(p_concept_normalized);

  update financial_app.transactions t
  set duplicate_state = case
        when v_matches <= 1 then 'none'
        when exists (
          select 1
          from financial_app.transaction_duplicate_reviews r
          where r.transaction_id=t.id
            and r.reviewed_source_record_id=t.source_record_id
            and r.decision='confirmed'
        ) then 'confirmed'
        when exists (
          select 1
          from financial_app.transaction_duplicate_reviews r
          where r.transaction_id=t.id
            and r.reviewed_source_record_id=t.source_record_id
            and r.decision='dismissed'
        ) then 'none'
        else 'suspected'
      end,
      updated_at=now()
  where t.account_id=p_account_id
    and t.bank_date=p_bank_date
    and t.amount_cents=p_amount_cents
    and financial_app.normalize_label(t.concept_normalized)=financial_app.normalize_label(p_concept_normalized)
    and t.duplicate_state is distinct from case
      when v_matches <= 1 then 'none'
      when exists (
        select 1
        from financial_app.transaction_duplicate_reviews r
        where r.transaction_id=t.id
          and r.reviewed_source_record_id=t.source_record_id
          and r.decision='confirmed'
      ) then 'confirmed'
      when exists (
        select 1
        from financial_app.transaction_duplicate_reviews r
        where r.transaction_id=t.id
          and r.reviewed_source_record_id=t.source_record_id
          and r.decision='dismissed'
      ) then 'none'
      else 'suspected'
    end;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

create or replace function financial_app.review_duplicate(
  p_transaction_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tx financial_app.transactions%rowtype;
  v_candidate_count integer;
  v_original_state text;
  v_new_state text;
begin
  if p_decision not in ('confirmed','dismissed') then
    raise exception 'invalid_duplicate_review_decision';
  end if;

  select * into v_tx
  from financial_app.transactions
  where id=p_transaction_id
  for update;

  if v_tx.id is null then
    raise exception 'transaction_not_found';
  end if;

  select count(*)::int into v_candidate_count
  from financial_app.transactions t
  where t.account_id=v_tx.account_id
    and t.bank_date=v_tx.bank_date
    and t.amount_cents=v_tx.amount_cents
    and financial_app.normalize_label(t.concept_normalized)=financial_app.normalize_label(v_tx.concept_normalized);

  if v_candidate_count <= 1 then
    raise exception 'transaction_not_duplicate_candidate';
  end if;

  insert into financial_app.transaction_duplicate_reviews(
    transaction_id,decision,reviewed_source_record_id,reviewed_at,updated_at
  ) values (
    v_tx.id,p_decision,v_tx.source_record_id,now(),now()
  )
  on conflict(transaction_id) do update set
    decision=excluded.decision,
    reviewed_source_record_id=excluded.reviewed_source_record_id,
    reviewed_at=now(),
    updated_at=now();

  v_original_state := v_tx.duplicate_state;
  v_new_state := case p_decision when 'confirmed' then 'confirmed' else 'none' end;

  if v_original_state is distinct from v_new_state then
    update financial_app.transactions
    set duplicate_state=v_new_state,updated_at=now()
    where id=v_tx.id;

    insert into financial_app.audit_changes(
      entity_type,entity_id,field_name,original_value,new_value,change_origin
    ) values (
      'transaction',v_tx.id,'duplicate_state',to_jsonb(v_original_state),to_jsonb(v_new_state),'user'
    );
  end if;

  return jsonb_build_object(
    'transactionId',v_tx.id,
    'decision',p_decision,
    'duplicateState',v_new_state,
    'candidateCount',v_candidate_count,
    'reviewedSourceRecordId',v_tx.source_record_id
  );
end;
$$;

create or replace function financial_app.list_duplicate_group(p_transaction_id uuid)
returns table(
  id uuid,
  account_id uuid,
  account_name text,
  bank_date date,
  concept_normalized text,
  amount_cents bigint,
  duplicate_state text,
  decision text,
  review_current boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tx financial_app.transactions%rowtype;
begin
  select * into v_tx
  from financial_app.transactions
  where id=p_transaction_id;

  if v_tx.id is null then raise exception 'transaction_not_found'; end if;

  return query
  select
    t.id,t.account_id,a.name,t.bank_date,t.concept_normalized,t.amount_cents,t.duplicate_state,
    r.decision,
    (r.reviewed_source_record_id=t.source_record_id) as review_current
  from financial_app.transactions t
  join financial_app.accounts a on a.id=t.account_id
  left join financial_app.transaction_duplicate_reviews r on r.transaction_id=t.id
  where t.account_id=v_tx.account_id
    and t.bank_date=v_tx.bank_date
    and t.amount_cents=v_tx.amount_cents
    and financial_app.normalize_label(t.concept_normalized)=financial_app.normalize_label(v_tx.concept_normalized)
  order by t.bank_date,t.id;
end;
$$;

create or replace function financial_app.list_transfer_candidates(
  p_transaction_id uuid,
  p_day_window integer default 3
)
returns table(
  id uuid,
  account_id uuid,
  account_name text,
  bank_date date,
  concept_normalized text,
  amount_cents bigint,
  transfer_pair_id uuid,
  day_gap integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tx financial_app.transactions%rowtype;
  v_effective_kind text;
begin
  if p_day_window < 0 or p_day_window > 7 then raise exception 'invalid_transfer_day_window'; end if;

  select t.* into v_tx from financial_app.transactions t where t.id=p_transaction_id;
  if v_tx.id is null then raise exception 'transaction_not_found'; end if;

  select coalesce(o.kind_override,v_tx.kind)
  into v_effective_kind
  from (select 1) s
  left join financial_app.transaction_overrides o on o.transaction_id=v_tx.id;

  if v_effective_kind is distinct from 'transfer' then
    return;
  end if;

  return query
  select
    c.id,c.account_id,a.name,c.bank_date,c.concept_normalized,c.amount_cents,c.transfer_pair_id,
    abs(c.bank_date-v_tx.bank_date)::int as day_gap
  from financial_app.transactions c
  join financial_app.accounts a on a.id=c.account_id
  left join financial_app.transaction_overrides o on o.transaction_id=c.id
  where c.id<>v_tx.id
    and c.account_id<>v_tx.account_id
    and c.amount_cents=-v_tx.amount_cents
    and abs(c.bank_date-v_tx.bank_date)<=p_day_window
    and coalesce(o.kind_override,c.kind)='transfer'
    and (c.transfer_pair_id is null or c.transfer_pair_id=v_tx.id)
    and (v_tx.transfer_pair_id is null or v_tx.transfer_pair_id=c.id)
  order by abs(c.bank_date-v_tx.bank_date),c.bank_date,c.id;
end;
$$;

create or replace function financial_app.pair_internal_transfer(
  p_transaction_id uuid,
  p_pair_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_a financial_app.transactions%rowtype;
  v_b financial_app.transactions%rowtype;
  v_kind_a text;
  v_kind_b text;
  v_changed boolean := false;
begin
  if p_transaction_id is null or p_pair_id is null or p_transaction_id=p_pair_id then
    raise exception 'invalid_transfer_pair';
  end if;

  perform 1
  from financial_app.transactions
  where id in (p_transaction_id,p_pair_id)
  order by id
  for update;

  select * into v_a from financial_app.transactions where id=p_transaction_id;
  select * into v_b from financial_app.transactions where id=p_pair_id;
  if v_a.id is null or v_b.id is null then raise exception 'transaction_not_found'; end if;

  select coalesce(o.kind_override,v_a.kind) into v_kind_a
  from (select 1) s left join financial_app.transaction_overrides o on o.transaction_id=v_a.id;
  select coalesce(o.kind_override,v_b.kind) into v_kind_b
  from (select 1) s left join financial_app.transaction_overrides o on o.transaction_id=v_b.id;

  if v_kind_a<>'transfer' or v_kind_b<>'transfer' then raise exception 'transfer_kind_required'; end if;
  if v_a.account_id=v_b.account_id then raise exception 'transfer_accounts_must_differ'; end if;
  if v_a.amount_cents<>-v_b.amount_cents then raise exception 'transfer_amounts_must_balance'; end if;
  if abs(v_a.bank_date-v_b.bank_date)>3 then raise exception 'transfer_dates_too_far_apart'; end if;
  if v_a.transfer_pair_id is not null and v_a.transfer_pair_id<>v_b.id then raise exception 'transaction_already_paired'; end if;
  if v_b.transfer_pair_id is not null and v_b.transfer_pair_id<>v_a.id then raise exception 'transaction_already_paired'; end if;

  if v_a.transfer_pair_id is distinct from v_b.id or v_b.transfer_pair_id is distinct from v_a.id then
    update financial_app.transactions
    set transfer_pair_id=case when id=v_a.id then v_b.id else v_a.id end,updated_at=now()
    where id in (v_a.id,v_b.id);

    if v_a.transfer_pair_id is distinct from v_b.id then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values('transaction',v_a.id,'transfer_pair_id',to_jsonb(v_a.transfer_pair_id),to_jsonb(v_b.id),'user');
    end if;
    if v_b.transfer_pair_id is distinct from v_a.id then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values('transaction',v_b.id,'transfer_pair_id',to_jsonb(v_b.transfer_pair_id),to_jsonb(v_a.id),'user');
    end if;
    v_changed := true;
  end if;

  return jsonb_build_object(
    'transactionId',v_a.id,
    'pairId',v_b.id,
    'changed',v_changed,
    'dayGap',abs(v_a.bank_date-v_b.bank_date),
    'balanced',true
  );
end;
$$;

create or replace function financial_app.unpair_internal_transfer(p_transaction_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tx financial_app.transactions%rowtype;
  v_pair_id uuid;
begin
  select * into v_tx from financial_app.transactions where id=p_transaction_id for update;
  if v_tx.id is null then raise exception 'transaction_not_found'; end if;
  v_pair_id := v_tx.transfer_pair_id;
  if v_pair_id is null then
    return jsonb_build_object('transactionId',v_tx.id,'pairId',null,'changed',false);
  end if;

  perform 1 from financial_app.transactions where id=v_pair_id for update;

  update financial_app.transactions
  set transfer_pair_id=null,updated_at=now()
  where id in (v_tx.id,v_pair_id)
    and transfer_pair_id is not null;

  insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
  values('transaction',v_tx.id,'transfer_pair_id',to_jsonb(v_pair_id),'null'::jsonb,'user');

  if exists(select 1 from financial_app.transactions where id=v_pair_id) then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('transaction',v_pair_id,'transfer_pair_id',to_jsonb(v_tx.id),'null'::jsonb,'user');
  end if;

  return jsonb_build_object('transactionId',v_tx.id,'pairId',v_pair_id,'changed',true);
end;
$$;

create or replace function financial_app.invalidate_transfer_pair_on_source_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pair_id uuid;
begin
  if old.transfer_pair_id is not null and (
    old.account_id is distinct from new.account_id
    or old.bank_date is distinct from new.bank_date
    or old.amount_cents is distinct from new.amount_cents
  ) then
    v_pair_id := old.transfer_pair_id;
    new.transfer_pair_id := null;

    update financial_app.transactions
    set transfer_pair_id=null,updated_at=now()
    where id=v_pair_id and transfer_pair_id=old.id;

    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('transaction',old.id,'transfer_pair_id',to_jsonb(v_pair_id),'null'::jsonb,'system_rule');

    if found then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values('transaction',v_pair_id,'transfer_pair_id',to_jsonb(old.id),'null'::jsonb,'system_rule');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_invalidate_transfer_pair on financial_app.transactions;
create trigger transactions_invalidate_transfer_pair
before update of account_id,bank_date,amount_cents on financial_app.transactions
for each row execute function financial_app.invalidate_transfer_pair_on_source_change();

create or replace function financial_app.enforce_paired_transfer_override()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pair_id uuid;
begin
  select transfer_pair_id into v_pair_id
  from financial_app.transactions
  where id=new.transaction_id;

  if v_pair_id is not null and new.kind_override is not null and new.kind_override<>'transfer' then
    raise exception 'paired_transfer_kind_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists transaction_overrides_paired_transfer_kind on financial_app.transaction_overrides;
create trigger transaction_overrides_paired_transfer_kind
before insert or update of kind_override on financial_app.transaction_overrides
for each row execute function financial_app.enforce_paired_transfer_override();

create or replace function financial_app.assert_transfer_pair_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pair financial_app.transactions%rowtype;
begin
  if new.transfer_pair_id is null then return null; end if;

  select * into v_pair from financial_app.transactions where id=new.transfer_pair_id;
  if v_pair.id is null then raise exception 'transfer_pair_missing'; end if;
  if v_pair.transfer_pair_id is distinct from new.id then raise exception 'transfer_pair_not_symmetric'; end if;
  if v_pair.account_id=new.account_id then raise exception 'transfer_accounts_must_differ'; end if;
  if v_pair.amount_cents<>-new.amount_cents then raise exception 'transfer_amounts_must_balance'; end if;
  if abs(v_pair.bank_date-new.bank_date)>3 then raise exception 'transfer_dates_too_far_apart'; end if;
  return null;
end;
$$;

drop trigger if exists transactions_transfer_pair_consistency on financial_app.transactions;
create constraint trigger transactions_transfer_pair_consistency
after insert or update of transfer_pair_id,account_id,bank_date,amount_cents on financial_app.transactions
deferrable initially deferred
for each row execute function financial_app.assert_transfer_pair_consistency();

-- Un par confirmado es siempre un movimiento efectivo de tipo transferencia; al deshacerlo
-- reaparece el override manual (si existe) o el tipo procedente de la capa derivada bancaria.
create or replace function financial_app.effective_transaction_kind(
  p_transaction_id uuid,
  p_base_kind text,
  p_kind_override text,
  p_transfer_pair_id uuid
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_transfer_pair_id is not null then 'transfer' else coalesce(p_kind_override,p_base_kind) end
$$;

update financial_app.schema_meta
set schema_version=12,updated_at=now()
where id=true;
