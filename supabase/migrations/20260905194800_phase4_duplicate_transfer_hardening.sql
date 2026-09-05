-- Fase 4 / Bloque 13 · hardening del motor de duplicados y transferencias.

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
  select t.* into v_tx
  from financial_app.transactions t
  where t.id=p_transaction_id;

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

create or replace function financial_app.invalidate_transfer_pair_on_source_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pair_id uuid;
  v_counterpart_changed boolean := false;
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
    v_counterpart_changed := found;

    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
    values('transaction',old.id,'transfer_pair_id',to_jsonb(v_pair_id),'null'::jsonb,'system_rule');

    if v_counterpart_changed then
      insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value,change_origin)
      values('transaction',v_pair_id,'transfer_pair_id',to_jsonb(old.id),'null'::jsonb,'system_rule');
    end if;
  end if;
  return new;
end;
$$;

-- La comprobación diferida cubre cualquier cambio directo, mientras que el trigger BEFORE
-- deshace automáticamente un par si una revisión de la fuente cambia cuenta/fecha/importe.
drop trigger if exists transactions_transfer_pair_consistency on financial_app.transactions;
create constraint trigger transactions_transfer_pair_consistency
after insert or update on financial_app.transactions
deferrable initially deferred
for each row execute function financial_app.assert_transfer_pair_consistency();
