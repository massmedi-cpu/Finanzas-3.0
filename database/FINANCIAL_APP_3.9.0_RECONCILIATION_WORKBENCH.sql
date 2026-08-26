begin;

-- Financial App 3.9.0 — conciliación accionable, auditable y conservadora.
-- No altera la fuente; las decisiones manuales usan el override existente y quedan registradas.

create table if not exists financial_app.reconciliation_decisions(
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references financial_app.transactions(id) on delete cascade,
  decision text not null check(decision in('reconciled','not_reconciled','source')),
  previous_status text not null,
  resulting_status text not null,
  reason text,
  decided_by text not null,
  created_at timestamptz not null default now()
);

alter table financial_app.reconciliation_decisions enable row level security;
revoke all on table financial_app.reconciliation_decisions from public,anon,authenticated;
create index if not exists reconciliation_decisions_transaction_created_idx
  on financial_app.reconciliation_decisions(transaction_id,created_at desc);

create or replace function financial_app.reconciliation_queue_core(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_status text:=nullif(lower(btrim(coalesce(p_status,''))), '');
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_total integer:=0;
  v_items jsonb:='[]'::jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_status is not null and v_status not in('pending','not_reconciled') then raise exception 'invalid_reconciliation_status'; end if;

  with unresolved as materialized(
    select t.*,financial_app.effective_reconciliation_status(t) reconciliation_status
    from financial_app.transactions t
    where not t.source_missing
      and not t.is_duplicate
      and financial_app.effective_reconciliation_status(t) in('pending','not_reconciled')
      and (v_status is null or financial_app.effective_reconciliation_status(t)=v_status)
  )
  select count(*) into v_total from unresolved;

  with unresolved as materialized(
    select t.*,financial_app.effective_reconciliation_status(t) reconciliation_status
    from financial_app.transactions t
    where not t.source_missing
      and not t.is_duplicate
      and financial_app.effective_reconciliation_status(t) in('pending','not_reconciled')
      and (v_status is null or financial_app.effective_reconciliation_status(t)=v_status)
  ),page as(
    select * from unresolved
    order by case when reconciliation_status='pending' then 0 else 1 end,
             coalesce(effective_date,source_date) desc nulls last,
             abs(coalesce(source_amount,0)) desc,
             id
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'sourceId',p.source_id,
    'date',coalesce(p.effective_date,p.source_date),
    'amount',p.source_amount,
    'account',p.source_account,
    'identifier',p.source_identifier,
    'subcategory',coalesce(p.subcategory_override,p.source_subcategory),
    'concept',coalesce(p.normalized_concept_override,p.source_normalized_concept,p.source_original_concept),
    'counterparty',coalesce(p.counterparty_override,p.source_counterparty),
    'status',p.reconciliation_status,
    'sourceStatus',p.source_reconciled,
    'override',p.is_reconciled,
    'internalTransfer',p.is_internal_transfer,
    'updatedAt',p.updated_at,
    'candidates',coalesce(c.items,'[]'::jsonb),
    'candidateCount',coalesce(c.n,0),
    'lastDecision',d.last_decision
  ) order by case when p.reconciliation_status='pending' then 0 else 1 end,coalesce(p.effective_date,p.source_date) desc nulls last,abs(coalesce(p.source_amount,0)) desc,p.id),'[]'::jsonb)
  into v_items
  from page p
  left join lateral(
    select count(*)::integer n,
      coalesce(jsonb_agg(jsonb_build_object(
        'id',x.id,
        'sourceId',x.source_id,
        'date',coalesce(x.effective_date,x.source_date),
        'amount',x.source_amount,
        'account',x.source_account,
        'identifier',x.source_identifier,
        'concept',coalesce(x.normalized_concept_override,x.source_normalized_concept,x.source_original_concept),
        'updatedAt',x.updated_at,
        'dayDifference',abs(coalesce(p.effective_date,p.source_date)-coalesce(x.effective_date,x.source_date))
      ) order by abs(coalesce(p.effective_date,p.source_date)-coalesce(x.effective_date,x.source_date)),coalesce(x.effective_date,x.source_date),x.id),'[]'::jsonb) items
    from(
      select b.*
      from financial_app.transactions b
      where p.is_internal_transfer
        and b.is_internal_transfer
        and not b.source_missing
        and not b.is_duplicate
        and b.id<>p.id
        and financial_app.effective_reconciliation_status(b)='pending'
        and coalesce(b.source_identifier,'')<>coalesce(p.source_identifier,'')
        and abs(coalesce(p.source_amount,0)+coalesce(b.source_amount,0))<=0.01
        and abs(coalesce(p.effective_date,p.source_date)-coalesce(b.effective_date,b.source_date))<=3
        and not exists(
          select 1 from financial_app.reconciliation_pairs rp
          where rp.status='matched' and (rp.transaction_a_id=b.id or rp.transaction_b_id=b.id)
        )
      order by abs(coalesce(p.effective_date,p.source_date)-coalesce(b.effective_date,b.source_date)),coalesce(b.effective_date,b.source_date),b.id
      limit 5
    ) x
  ) c on true
  left join lateral(
    select jsonb_build_object('decision',rd.decision,'reason',rd.reason,'createdAt',rd.created_at,'decidedBy',rd.decided_by) last_decision
    from financial_app.reconciliation_decisions rd
    where rd.transaction_id=p.id
    order by rd.created_at desc
    limit 1
  ) d on true;

  return jsonb_build_object('ok',true,'total',v_total,'limit',v_limit,'offset',v_offset,'status',v_status,'items',v_items);
end
$$;

revoke all on function financial_app.reconciliation_queue_core(text,integer,integer) from public,anon;
grant execute on function financial_app.reconciliation_queue_core(text,integer,integer) to authenticated,service_role;

create or replace function public.financial_app_reconciliation_queue(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
set search_path=pg_catalog,financial_app
as $$ select financial_app.reconciliation_queue_core(p_status,p_limit,p_offset) $$;

revoke all on function public.financial_app_reconciliation_queue(text,integer,integer) from public,anon;
grant execute on function public.financial_app_reconciliation_queue(text,integer,integer) to authenticated,service_role;

create or replace function financial_app.set_reconciliation_status_core(
  p_transaction_id uuid,
  p_status text,
  p_reason text,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_t financial_app.transactions%rowtype;
  v_after financial_app.transactions%rowtype;
  v_previous text;
  v_result text;
  v_override boolean;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_status text:=lower(btrim(coalesce(p_status,'')));
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_status not in('reconciled','not_reconciled','source') then raise exception 'invalid_reconciliation_decision'; end if;
  if v_status<>'source' and (v_reason is null or length(v_reason)<3) then raise exception 'reconciliation_reason_required'; end if;
  if length(coalesce(v_reason,''))>500 then raise exception 'reconciliation_reason_too_long'; end if;

  select * into v_t from financial_app.transactions where id=p_transaction_id for update;
  if not found then raise exception 'transaction_not_found' using errcode='P0002'; end if;
  if p_expected_updated_at is not null and v_t.updated_at is distinct from p_expected_updated_at then raise exception 'changed_since_open'; end if;
  if v_t.source_missing or v_t.is_duplicate then raise exception 'invalid_source_state'; end if;

  v_previous:=financial_app.effective_reconciliation_status(v_t);
  v_override:=case v_status when 'reconciled' then true when 'not_reconciled' then false else null end;

  if v_t.is_reconciled is distinct from v_override then
    insert into financial_app.transaction_history(transaction_id,field_name,value_origin,value_before,value_after,change_origin,changed_by)
    values(v_t.id,'app.isReconciled',to_jsonb(v_t.source_reconciled),to_jsonb(v_t.is_reconciled),to_jsonb(v_override),'reconciliation_manual',v_email);
    update financial_app.transactions
       set is_reconciled=v_override,updated_at=now()
     where id=v_t.id
     returning * into v_after;
  else
    v_after:=v_t;
  end if;

  v_result:=financial_app.effective_reconciliation_status(v_after);
  insert into financial_app.reconciliation_decisions(transaction_id,decision,previous_status,resulting_status,reason,decided_by)
  values(v_t.id,v_status,v_previous,v_result,v_reason,v_email);

  return jsonb_build_object('ok',true,'id',v_t.id,'sourceId',v_t.source_id,'previousStatus',v_previous,'status',v_result,'override',v_after.is_reconciled,'updatedAt',v_after.updated_at);
end
$$;

revoke all on function financial_app.set_reconciliation_status_core(uuid,text,text,timestamptz) from public,anon;
grant execute on function financial_app.set_reconciliation_status_core(uuid,text,text,timestamptz) to authenticated,service_role;

create or replace function public.financial_app_set_reconciliation_status(
  p_transaction_id uuid,
  p_status text,
  p_reason text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language sql
set search_path=pg_catalog,financial_app
as $$ select financial_app.set_reconciliation_status_core(p_transaction_id,p_status,p_reason,p_expected_updated_at) $$;

revoke all on function public.financial_app_set_reconciliation_status(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.financial_app_set_reconciliation_status(uuid,text,text,timestamptz) to authenticated,service_role;

create or replace function financial_app.reconcile_pair_safe_core(
  p_a uuid,
  p_b uuid,
  p_expected_a_updated_at timestamptz,
  p_expected_b_updated_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_a_updated timestamptz;
  v_b_updated timestamptz;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_reason is null or length(v_reason)<3 then raise exception 'reconciliation_reason_required'; end if;
  if length(v_reason)>500 then raise exception 'reconciliation_reason_too_long'; end if;

  select updated_at into v_a_updated from financial_app.transactions where id=p_a for update;
  if not found then raise exception 'transaction_a_not_found'; end if;
  select updated_at into v_b_updated from financial_app.transactions where id=p_b for update;
  if not found then raise exception 'transaction_b_not_found'; end if;
  if p_expected_a_updated_at is not null and v_a_updated is distinct from p_expected_a_updated_at then raise exception 'changed_since_open'; end if;
  if p_expected_b_updated_at is not null and v_b_updated is distinct from p_expected_b_updated_at then raise exception 'candidate_changed_since_open'; end if;

  return financial_app.reconcile_pair_core(p_a,p_b,v_reason,'manual_exact',100);
end
$$;

revoke all on function financial_app.reconcile_pair_safe_core(uuid,uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function financial_app.reconcile_pair_safe_core(uuid,uuid,timestamptz,timestamptz,text) to authenticated,service_role;

create or replace function public.financial_app_reconcile_pair_safe(
  p_a uuid,
  p_b uuid,
  p_expected_a_updated_at timestamptz,
  p_expected_b_updated_at timestamptz,
  p_reason text
)
returns jsonb
language sql
set search_path=pg_catalog,financial_app
as $$ select financial_app.reconcile_pair_safe_core(p_a,p_b,p_expected_a_updated_at,p_expected_b_updated_at,p_reason) $$;

revoke all on function public.financial_app_reconcile_pair_safe(uuid,uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.financial_app_reconcile_pair_safe(uuid,uuid,timestamptz,timestamptz,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
