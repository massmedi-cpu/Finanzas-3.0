-- CR-006 · Distinguir operaciones repetidas reales de duplicados candidatos.
-- Una firma base (cuenta + fecha + importe + concepto) solo sigue siendo candidata
-- cuando saldo y hora disponibles no demuestran que son operaciones diferentes.

create or replace function financial_app.duplicate_candidate_group(p_transaction_id uuid)
returns table(id uuid)
language sql
stable
set search_path = ''
as $$
  with anchor as (
    select
      t.id,
      t.workspace_id,
      t.account_id,
      t.bank_date,
      t.amount_cents,
      financial_app.normalize_label(t.concept_normalized) as concept_key,
      t.balance_after_cents,
      case
        when pg_catalog.btrim(coalesce(sr.source_payload->>'Hora', '')) ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
          then pg_catalog.btrim(sr.source_payload->>'Hora')::time
        else null
      end as source_time
    from financial_app.transactions t
    join financial_app.transaction_source_records sr
      on sr.id = t.source_record_id
     and sr.workspace_id = t.workspace_id
    where t.id = p_transaction_id
      and t.workspace_id = financial_app.require_current_workspace_id()
  )
  select candidate.id
  from anchor a
  join financial_app.transactions candidate
    on candidate.workspace_id = a.workspace_id
   and candidate.account_id = a.account_id
   and candidate.bank_date = a.bank_date
   and candidate.amount_cents = a.amount_cents
   and financial_app.normalize_label(candidate.concept_normalized) = a.concept_key
  join financial_app.transaction_source_records candidate_source
    on candidate_source.id = candidate.source_record_id
   and candidate_source.workspace_id = candidate.workspace_id
  where not (
      a.balance_after_cents is not null
      and candidate.balance_after_cents is not null
      and a.balance_after_cents is distinct from candidate.balance_after_cents
    )
    and not (
      a.source_time is not null
      and case
        when pg_catalog.btrim(coalesce(candidate_source.source_payload->>'Hora', '')) ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
          then pg_catalog.btrim(candidate_source.source_payload->>'Hora')::time
        else null
      end is not null
      and a.source_time is distinct from case
        when pg_catalog.btrim(coalesce(candidate_source.source_payload->>'Hora', '')) ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
          then pg_catalog.btrim(candidate_source.source_payload->>'Hora')::time
        else null
      end
    )
  order by candidate.id;
$$;

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
  v_workspace_id uuid := financial_app.require_current_workspace_id();
  v_tx record;
  v_matches integer;
  v_changed integer := 0;
  v_new_state text;
begin
  if p_account_id is null or p_bank_date is null or p_concept_normalized is null then
    raise exception 'invalid_duplicate_signature';
  end if;

  for v_tx in
    select t.id, t.source_record_id, t.duplicate_state
    from financial_app.transactions t
    where t.workspace_id = v_workspace_id
      and t.account_id = p_account_id
      and t.bank_date = p_bank_date
      and t.amount_cents = p_amount_cents
      and financial_app.normalize_label(t.concept_normalized) = financial_app.normalize_label(p_concept_normalized)
    for update
  loop
    select count(*)::int
    into v_matches
    from financial_app.duplicate_candidate_group(v_tx.id);

    v_new_state := case
      when v_matches <= 1 then 'none'
      when exists (
        select 1
        from financial_app.transaction_duplicate_reviews r
        where r.transaction_id = v_tx.id
          and r.reviewed_source_record_id = v_tx.source_record_id
          and r.decision = 'confirmed'
      ) then 'confirmed'
      when exists (
        select 1
        from financial_app.transaction_duplicate_reviews r
        where r.transaction_id = v_tx.id
          and r.reviewed_source_record_id = v_tx.source_record_id
          and r.decision = 'dismissed'
      ) then 'none'
      else 'suspected'
    end;

    if v_tx.duplicate_state is distinct from v_new_state then
      update financial_app.transactions
      set duplicate_state = v_new_state,
          updated_at = now()
      where id = v_tx.id;
      v_changed := v_changed + 1;
    end if;
  end loop;

  return v_changed;
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
begin
  if not exists (
    select 1
    from financial_app.duplicate_candidate_group(p_transaction_id)
  ) then
    raise exception 'transaction_not_found';
  end if;

  return query
  select
    t.id,
    t.account_id,
    a.name,
    t.bank_date,
    t.concept_normalized,
    t.amount_cents,
    t.duplicate_state,
    r.decision,
    (r.reviewed_source_record_id = t.source_record_id) as review_current
  from financial_app.duplicate_candidate_group(p_transaction_id) g
  join financial_app.transactions t on t.id = g.id
  join financial_app.accounts a
    on a.id = t.account_id
   and a.workspace_id = t.workspace_id
  left join financial_app.transaction_duplicate_reviews r on r.transaction_id = t.id
  order by t.bank_date, t.id;
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
  if p_decision not in ('confirmed', 'dismissed') then
    raise exception 'invalid_duplicate_review_decision';
  end if;

  select *
  into v_tx
  from financial_app.transactions
  where id = p_transaction_id
  for update;

  if v_tx.id is null then
    raise exception 'transaction_not_found';
  end if;

  select count(*)::int
  into v_candidate_count
  from financial_app.duplicate_candidate_group(v_tx.id);

  if v_candidate_count <= 1 then
    raise exception 'transaction_not_duplicate_candidate';
  end if;

  insert into financial_app.transaction_duplicate_reviews(
    transaction_id,
    decision,
    reviewed_source_record_id,
    reviewed_at,
    updated_at
  ) values (
    v_tx.id,
    p_decision,
    v_tx.source_record_id,
    now(),
    now()
  )
  on conflict(transaction_id) do update set
    decision = excluded.decision,
    reviewed_source_record_id = excluded.reviewed_source_record_id,
    reviewed_at = now(),
    updated_at = now();

  v_original_state := v_tx.duplicate_state;
  v_new_state := case p_decision when 'confirmed' then 'confirmed' else 'none' end;

  if v_original_state is distinct from v_new_state then
    update financial_app.transactions
    set duplicate_state = v_new_state,
        updated_at = now()
    where id = v_tx.id;

    insert into financial_app.audit_changes(
      entity_type,
      entity_id,
      field_name,
      original_value,
      new_value,
      change_origin
    ) values (
      'transaction',
      v_tx.id,
      'duplicate_state',
      to_jsonb(v_original_state),
      to_jsonb(v_new_state),
      'user'
    );
  end if;

  return jsonb_build_object(
    'transactionId', v_tx.id,
    'decision', p_decision,
    'duplicateState', v_new_state,
    'candidateCount', v_candidate_count,
    'reviewedSourceRecordId', v_tx.source_record_id
  );
end;
$$;

revoke execute on function financial_app.duplicate_candidate_group(uuid) from public, anon, authenticated, service_role;
revoke execute on function financial_app.recompute_duplicate_signature(uuid,date,bigint,text) from public, anon, authenticated, service_role;
revoke execute on function financial_app.list_duplicate_group(uuid) from public, anon, authenticated, service_role;
revoke execute on function financial_app.review_duplicate(uuid,text) from public, anon, authenticated, service_role;

grant execute on function financial_app.duplicate_candidate_group(uuid) to financial_app_gateway;
grant execute on function financial_app.recompute_duplicate_signature(uuid,date,bigint,text) to financial_app_gateway;
grant execute on function financial_app.list_duplicate_group(uuid) to financial_app_gateway;
grant execute on function financial_app.review_duplicate(uuid,text) to financial_app_gateway;

-- Recalcula únicamente firmas ya clasificadas como sospechosas/confirmadas.
-- No elimina movimientos, no altera registros de origen y no inventa datos.
do $$
declare
  v_workspace record;
  v_signature record;
begin
  for v_workspace in
    select w.id
    from financial_app.workspaces w
    order by w.id
  loop
    perform pg_catalog.set_config('financial_app.workspace_id', v_workspace.id::text, true);

    for v_signature in
      select distinct
        t.account_id,
        t.bank_date,
        t.amount_cents,
        t.concept_normalized
      from financial_app.transactions t
      where t.workspace_id = v_workspace.id
        and t.duplicate_state in ('suspected', 'confirmed')
    loop
      perform financial_app.recompute_duplicate_signature(
        v_signature.account_id,
        v_signature.bank_date,
        v_signature.amount_cents,
        v_signature.concept_normalized
      );
    end loop;
  end loop;
end;
$$;
