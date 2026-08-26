begin;

-- Financial App 3.8.0 — cierre de edición masiva.
-- Cada lote queda identificado, conserva el estado anterior y puede deshacerse
-- únicamente si ninguno de sus movimientos ha cambiado después del lote.

create table if not exists financial_app.transaction_bulk_batches (
  id uuid primary key default gen_random_uuid(),
  created_by text not null,
  patch jsonb not null,
  item_count integer not null check(item_count between 1 and 200),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by text
);

create table if not exists financial_app.transaction_bulk_batch_items (
  batch_id uuid not null references financial_app.transaction_bulk_batches(id) on delete cascade,
  transaction_id uuid not null references financial_app.transactions(id) on delete cascade,
  before_patch jsonb not null,
  after_updated_at timestamptz not null,
  primary key(batch_id,transaction_id)
);

revoke all on table financial_app.transaction_bulk_batches from public, anon, authenticated;
revoke all on table financial_app.transaction_bulk_batch_items from public, anon, authenticated;
grant all on table financial_app.transaction_bulk_batches to service_role;
grant all on table financial_app.transaction_bulk_batch_items to service_role;

create index if not exists transaction_bulk_batches_user_created_idx
  on financial_app.transaction_bulk_batches(created_by,created_at desc);

create or replace function financial_app.bulk_update_transactions_rpc(
  p_transaction_ids uuid[],
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, financial_app, auth
as $$
declare
  v_email text;
  v_ids uuid[];
  v_id uuid;
  v_count int;
  v_batch_id uuid:=gen_random_uuid();
  v_before financial_app.transactions%rowtype;
  v_after_updated_at timestamptz;
  v_before_patch jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb then raise exception 'invalid_patch'; end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
  into v_ids
  from (select distinct id from unnest(coalesce(p_transaction_ids,array[]::uuid[])) id where id is not null) q;

  v_count:=cardinality(v_ids);
  if v_count=0 then raise exception 'no_transactions_selected'; end if;
  if v_count>200 then raise exception 'bulk_limit_exceeded'; end if;

  -- Bloqueo determinista de todas las filas antes de modificar ninguna.
  -- Evita carreras entre dos lotes concurrentes y mantiene el lote totalmente atómico.
  perform 1
  from financial_app.transactions t
  where t.id=any(v_ids)
  order by t.id
  for update;

  if (select count(*) from financial_app.transactions where id=any(v_ids))<>v_count then
    raise exception 'transaction_not_found' using errcode='P0002';
  end if;

  insert into financial_app.transaction_bulk_batches(id,created_by,patch,item_count)
  values(v_batch_id,v_email,p_patch,v_count);

  foreach v_id in array v_ids loop
    select * into strict v_before from financial_app.transactions where id=v_id;

    -- Snapshot completo de campos editables. Al deshacer se restaura exactamente
    -- el estado de overrides/flags que existía justo antes de este lote.
    v_before_patch:=jsonb_build_object(
      'category',v_before.category_override,
      'subcategory',v_before.subcategory_override,
      'type',v_before.type_override,
      'normalizedConcept',v_before.normalized_concept_override,
      'counterparty',v_before.counterparty_override,
      'description',v_before.description_override,
      'effectiveDate',v_before.effective_date,
      'cashFlowOverride',v_before.cash_flow_override,
      'isInternalTransfer',v_before.is_internal_transfer,
      'isDuplicate',v_before.is_duplicate,
      'isReconciled',v_before.is_reconciled,
      'needsReview',v_before.needs_review,
      'isRecurring',v_before.is_recurring,
      'tags',to_jsonb(v_before.tags),
      'notes',v_before.notes
    );

    perform financial_app.update_transaction_rpc(v_id,p_patch);
    select updated_at into v_after_updated_at from financial_app.transactions where id=v_id;

    insert into financial_app.transaction_bulk_batch_items(batch_id,transaction_id,before_patch,after_updated_at)
    values(v_batch_id,v_id,v_before_patch,v_after_updated_at);
  end loop;

  return jsonb_build_object(
    'ok',true,
    'updated',v_count,
    'ids',to_jsonb(v_ids),
    'batchId',v_batch_id,
    'canUndo',true
  );
end
$$;

revoke all on function financial_app.bulk_update_transactions_rpc(uuid[],jsonb) from public, anon;
grant execute on function financial_app.bulk_update_transactions_rpc(uuid[],jsonb) to authenticated, service_role;

create or replace function financial_app.undo_bulk_transaction_batch_rpc(p_batch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, financial_app, auth
as $$
declare
  v_email text;
  v_batch financial_app.transaction_bulk_batches%rowtype;
  v_item record;
  v_current_updated_at timestamptz;
  v_count int:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  if p_batch_id is null then
    select * into v_batch
    from financial_app.transaction_bulk_batches
    where created_by=v_email and undone_at is null
    order by created_at desc
    limit 1
    for update;
  else
    select * into v_batch
    from financial_app.transaction_bulk_batches
    where id=p_batch_id and created_by=v_email
    for update;
  end if;

  if not found then raise exception 'bulk_batch_not_found' using errcode='P0002'; end if;
  if v_batch.undone_at is not null then raise exception 'bulk_batch_already_undone'; end if;

  -- Primero bloquea y valida TODO el lote. Si un movimiento cambió desde la edición
  -- masiva, no deshace nada para no pisar una edición posterior legítima.
  for v_item in
    select i.*
    from financial_app.transaction_bulk_batch_items i
    where i.batch_id=v_batch.id
    order by i.transaction_id
  loop
    select updated_at into v_current_updated_at
    from financial_app.transactions
    where id=v_item.transaction_id
    for update;
    if not found then raise exception 'transaction_not_found' using errcode='P0002'; end if;
    if v_current_updated_at is distinct from v_item.after_updated_at then
      raise exception 'bulk_batch_changed_since_apply';
    end if;
  end loop;

  for v_item in
    select i.*
    from financial_app.transaction_bulk_batch_items i
    where i.batch_id=v_batch.id
    order by i.transaction_id
  loop
    perform financial_app.update_transaction_rpc(v_item.transaction_id,v_item.before_patch);
    v_count:=v_count+1;
  end loop;

  update financial_app.transaction_bulk_batches
  set undone_at=now(),undone_by=v_email
  where id=v_batch.id;

  return jsonb_build_object('ok',true,'undone',v_count,'batchId',v_batch.id);
end
$$;

revoke all on function financial_app.undo_bulk_transaction_batch_rpc(uuid) from public, anon;
grant execute on function financial_app.undo_bulk_transaction_batch_rpc(uuid) to authenticated, service_role;

create or replace function public.financial_app_undo_bulk_transaction_batch(p_batch_id uuid default null)
returns jsonb
language sql
set search_path = pg_catalog, financial_app
as $$
  select financial_app.undo_bulk_transaction_batch_rpc(p_batch_id)
$$;

revoke all on function public.financial_app_undo_bulk_transaction_batch(uuid) from public, anon;
grant execute on function public.financial_app_undo_bulk_transaction_batch(uuid) to authenticated, service_role;

commit;
