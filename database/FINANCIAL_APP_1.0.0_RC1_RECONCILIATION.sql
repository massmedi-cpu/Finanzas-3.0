-- FINANCIAL APP · 1.0.0-rc.1
-- Conciliación trazable y estados efectivos.
-- Requiere las migraciones base de Financial App (transactions, transaction_history, authorized_email, current_app_version, movements_advanced_core, transaction_detail_rpc).

create table if not exists financial_app.reconciliation_pairs(
  id uuid primary key default gen_random_uuid(),
  transaction_a_id uuid not null references financial_app.transactions(id) on delete restrict,
  transaction_b_id uuid not null references financial_app.transactions(id) on delete restrict,
  status text not null default 'matched',
  method text not null default 'manual_exact',
  confidence numeric not null default 100 check(confidence between 0 and 100),
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  cancelled_by text,
  cancelled_at timestamptz,
  check(transaction_a_id<>transaction_b_id)
);
create unique index if not exists reconciliation_pairs_unique_active on financial_app.reconciliation_pairs(least(transaction_a_id,transaction_b_id),greatest(transaction_a_id,transaction_b_id)) where status='matched';
create index if not exists reconciliation_pairs_a_idx on financial_app.reconciliation_pairs(transaction_a_id) where status='matched';
create index if not exists reconciliation_pairs_b_idx on financial_app.reconciliation_pairs(transaction_b_id) where status='matched';
alter table financial_app.reconciliation_pairs enable row level security;
revoke all on financial_app.reconciliation_pairs from public,anon,authenticated;

create or replace function financial_app.effective_reconciliation_status(t financial_app.transactions)
returns text language sql stable security definer set search_path='pg_catalog','financial_app'
as $$
  select case
    when t.is_reconciled is true then 'reconciled'
    when t.is_reconciled is false then 'not_reconciled'
    when lower(trim(coalesce(t.source_reconciled,''))) in ('sí','si','yes','true','1') then 'reconciled'
    when lower(trim(coalesce(t.source_reconciled,'')))='no aplica' then 'not_applicable'
    when lower(trim(coalesce(t.source_reconciled,'')))='pendiente' then 'pending'
    when lower(trim(coalesce(t.source_reconciled,''))) in ('no','false','0') then 'not_reconciled'
    else 'pending'
  end
$$;
revoke all on function financial_app.effective_reconciliation_status(financial_app.transactions) from public,anon,authenticated;
grant execute on function financial_app.effective_reconciliation_status(financial_app.transactions) to service_role;

create or replace function financial_app.reconcile_pair_core(p_a uuid,p_b uuid,p_reason text default null,p_method text default 'manual_exact',p_confidence numeric default 100)
returns jsonb language plpgsql security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text; a financial_app.transactions%rowtype; b financial_app.transactions%rowtype; v_pair uuid; v_days integer; v_a_status text; v_b_status text;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_a=p_b then raise exception 'same_transaction'; end if;
  select * into a from financial_app.transactions where id=p_a for update; if not found then raise exception 'transaction_a_not_found'; end if;
  select * into b from financial_app.transactions where id=p_b for update; if not found then raise exception 'transaction_b_not_found'; end if;
  if a.source_missing or b.source_missing or a.is_duplicate or b.is_duplicate then raise exception 'invalid_source_state'; end if;
  if coalesce(a.source_identifier,'')=coalesce(b.source_identifier,'') then raise exception 'same_source_product'; end if;
  if abs(coalesce(a.source_amount,0)+coalesce(b.source_amount,0))>.01 then raise exception 'amounts_do_not_offset'; end if;
  v_days:=abs(coalesce(a.effective_date,a.source_date)-coalesce(b.effective_date,b.source_date));
  if v_days>3 then raise exception 'dates_too_far_apart'; end if;
  if not a.is_internal_transfer or not b.is_internal_transfer then raise exception 'pair_requires_internal_transfers'; end if;
  v_a_status:=financial_app.effective_reconciliation_status(a); v_b_status:=financial_app.effective_reconciliation_status(b);
  insert into financial_app.reconciliation_pairs(transaction_a_id,transaction_b_id,status,method,confidence,reason,created_by)
  values(p_a,p_b,'matched',coalesce(nullif(trim(p_method),''),'manual_exact'),least(greatest(coalesce(p_confidence,100),0),100),nullif(trim(coalesce(p_reason,'')),''),v_email)
  returning id into v_pair;
  if v_a_status<>'reconciled' then
    insert into financial_app.transaction_history(transaction_id,field_name,value_origin,value_before,value_after,change_origin,changed_by)
    values(a.id,'app.isReconciled',to_jsonb(a.source_reconciled),to_jsonb(a.is_reconciled),to_jsonb(true),'reconciliation',v_email);
    update financial_app.transactions set is_reconciled=true,updated_at=now() where id=a.id;
  end if;
  if v_b_status<>'reconciled' then
    insert into financial_app.transaction_history(transaction_id,field_name,value_origin,value_before,value_after,change_origin,changed_by)
    values(b.id,'app.isReconciled',to_jsonb(b.source_reconciled),to_jsonb(b.is_reconciled),to_jsonb(true),'reconciliation',v_email);
    update financial_app.transactions set is_reconciled=true,updated_at=now() where id=b.id;
  end if;
  return jsonb_build_object('ok',true,'pairId',v_pair,'a',a.source_id,'b',b.source_id,'amount',abs(a.source_amount),'dayDifference',v_days,'confidence',least(greatest(coalesce(p_confidence,100),0),100),'aPreviousStatus',v_a_status,'bPreviousStatus',v_b_status);
exception when unique_violation then raise exception 'pair_already_reconciled';
end $$;
revoke all on function financial_app.reconcile_pair_core(uuid,uuid,text,text,numeric) from public,anon;
grant execute on function financial_app.reconcile_pair_core(uuid,uuid,text,text,numeric) to authenticated,service_role;

create or replace function financial_app.auto_reconcile_linked_products_core()
returns jsonb language plpgsql security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text; r record; v_count integer:=0; v_pairs jsonb:='[]'::jsonb; v_result jsonb;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  for r in
    with pending as(
      select t.id,t.source_id,t.source_identifier,coalesce(t.effective_date,t.source_date) d,t.source_amount amount
      from financial_app.transactions t
      where financial_app.effective_reconciliation_status(t)='pending' and t.is_internal_transfer=true and t.source_missing=false and t.is_duplicate=false
        and not exists(select 1 from financial_app.reconciliation_pairs rp where rp.status='matched' and (rp.transaction_a_id=t.id or rp.transaction_b_id=t.id))
    ), candidates as(
      select p.id p_id,q.id q_id from pending p join financial_app.transactions q on q.id<>p.id
      and coalesce(q.source_identifier,'')<>coalesce(p.source_identifier,'')
      and financial_app.effective_reconciliation_status(q)='reconciled' and q.is_internal_transfer=true and q.source_missing=false and q.is_duplicate=false
      and abs(coalesce(q.source_amount,0)+coalesce(p.amount,0))<=.01 and coalesce(q.effective_date,q.source_date)=p.d
      and not exists(select 1 from financial_app.reconciliation_pairs rp where rp.status='matched' and (rp.transaction_a_id=q.id or rp.transaction_b_id=q.id))
    ), pc as(select p_id,count(*) n from candidates group by p_id), qc as(select q_id,count(*) n from candidates group by q_id)
    select c.p_id,c.q_id from candidates c join pc using(p_id) join qc using(q_id) where pc.n=1 and qc.n=1 order by c.p_id
  loop
    v_result:=financial_app.reconcile_pair_core(r.p_id,r.q_id,'Contrapartida exacta entre productos vinculados: misma fecha, importe opuesto y segunda pata ya conciliada en el origen.','linked_product_exact_same_day',100);
    v_count:=v_count+1; v_pairs:=v_pairs||jsonb_build_array(v_result);
  end loop;
  return jsonb_build_object('ok',true,'matchedPairs',v_count,'pairs',v_pairs);
end $$;
revoke all on function financial_app.auto_reconcile_linked_products_core() from public,anon;
grant execute on function financial_app.auto_reconcile_linked_products_core() to authenticated,service_role;

create or replace function financial_app.reconciliation_overview_core()
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text; v_summary jsonb; v_pairs jsonb; v_groups jsonb; v_methods jsonb;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select jsonb_build_object('total',count(*),'reconciled',count(*) filter(where financial_app.effective_reconciliation_status(t)='reconciled'),'pending',count(*) filter(where financial_app.effective_reconciliation_status(t)='pending'),'notReconciled',count(*) filter(where financial_app.effective_reconciliation_status(t)='not_reconciled'),'notApplicable',count(*) filter(where financial_app.effective_reconciliation_status(t)='not_applicable')) into v_summary from financial_app.transactions t;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'a',a.source_id,'b',b.source_id,'amount',abs(a.source_amount),'dateA',coalesce(a.effective_date,a.source_date),'dateB',coalesce(b.effective_date,b.source_date),'accountA',a.source_account,'accountB',b.source_account,'identifierA',a.source_identifier,'identifierB',b.source_identifier,'method',p.method,'confidence',p.confidence,'reason',p.reason,'createdAt',p.created_at) order by p.created_at desc),'[]'::jsonb) into v_pairs from financial_app.reconciliation_pairs p join financial_app.transactions a on a.id=p.transaction_a_id join financial_app.transactions b on b.id=p.transaction_b_id where p.status='matched';
  select coalesce(jsonb_agg(jsonb_build_object('identifier',g.source_identifier,'account',g.source_account,'subcategory',g.subcategory,'status',g.status,'count',g.n,'firstDate',g.first_date,'lastDate',g.last_date,'grossAmount',g.gross_amount) order by g.status,g.n desc,g.source_identifier,g.subcategory),'[]'::jsonb) into v_groups from(
    select t.source_identifier,t.source_account,coalesce(t.source_subcategory,'Sin subcategoría') subcategory,financial_app.effective_reconciliation_status(t) status,count(*) n,min(coalesce(t.effective_date,t.source_date)) first_date,max(coalesce(t.effective_date,t.source_date)) last_date,sum(abs(coalesce(t.source_amount,0))) gross_amount
    from financial_app.transactions t where financial_app.effective_reconciliation_status(t) in('pending','not_reconciled') group by t.source_identifier,t.source_account,coalesce(t.source_subcategory,'Sin subcategoría'),financial_app.effective_reconciliation_status(t)
  ) g;
  select coalesce(jsonb_agg(jsonb_build_object('method',x.method,'count',x.n) order by x.n desc,x.method),'[]'::jsonb) into v_methods from(select method,count(*) n from financial_app.reconciliation_pairs where status='matched' group by method)x;
  return jsonb_build_object('version',financial_app.current_app_version(),'summary',v_summary,'pairs',v_pairs,'unresolvedGroups',v_groups,'methods',v_methods);
end $$;
revoke all on function financial_app.reconciliation_overview_core() from public,anon;
grant execute on function financial_app.reconciliation_overview_core() to authenticated,service_role;

create or replace function financial_app.transaction_reconciliation_core(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','financial_app','auth'
as $$
declare v_email text; v_t financial_app.transactions%rowtype; v_status text; v_pair jsonb;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_t from financial_app.transactions where id=p_transaction_id; if not found then raise exception 'transaction_not_found' using errcode='P0002'; end if;
  v_status:=financial_app.effective_reconciliation_status(v_t);
  select jsonb_build_object('id',p.id,'method',p.method,'confidence',p.confidence,'reason',p.reason,'createdAt',p.created_at,'counterpart',jsonb_build_object('id',case when p.transaction_a_id=p_transaction_id then b.id else a.id end,'sourceId',case when p.transaction_a_id=p_transaction_id then b.source_id else a.source_id end,'date',case when p.transaction_a_id=p_transaction_id then coalesce(b.effective_date,b.source_date) else coalesce(a.effective_date,a.source_date) end,'amount',case when p.transaction_a_id=p_transaction_id then b.source_amount else a.source_amount end,'account',case when p.transaction_a_id=p_transaction_id then b.source_account else a.source_account end,'identifier',case when p.transaction_a_id=p_transaction_id then b.source_identifier else a.source_identifier end,'concept',case when p.transaction_a_id=p_transaction_id then coalesce(b.normalized_concept_override,b.source_normalized_concept,b.source_original_concept) else coalesce(a.normalized_concept_override,a.source_normalized_concept,a.source_original_concept) end)) into v_pair
  from financial_app.reconciliation_pairs p join financial_app.transactions a on a.id=p.transaction_a_id join financial_app.transactions b on b.id=p.transaction_b_id where p.status='matched' and (p.transaction_a_id=p_transaction_id or p.transaction_b_id=p_transaction_id) order by p.created_at desc limit 1;
  return jsonb_build_object('status',v_status,'sourceStatus',v_t.source_reconciled,'override',v_t.is_reconciled,'pair',v_pair);
end $$;
revoke all on function financial_app.transaction_reconciliation_core(uuid) from public,anon;
grant execute on function financial_app.transaction_reconciliation_core(uuid) to authenticated,service_role;

create or replace function public.financial_app_reconciliation_overview() returns jsonb language sql stable security invoker set search_path='pg_catalog','financial_app','auth' as $$select financial_app.reconciliation_overview_core()$$;
create or replace function public.financial_app_reconcile_pair(p_a uuid,p_b uuid,p_reason text default null,p_method text default 'manual_exact',p_confidence numeric default 100) returns jsonb language sql security invoker set search_path='pg_catalog','financial_app','auth' as $$select financial_app.reconcile_pair_core(p_a,p_b,p_reason,p_method,p_confidence)$$;
create or replace function public.financial_app_auto_reconcile_linked_products() returns jsonb language sql security invoker set search_path='pg_catalog','financial_app','auth' as $$select financial_app.auto_reconcile_linked_products_core()$$;
revoke all on function public.financial_app_reconciliation_overview(),public.financial_app_reconcile_pair(uuid,uuid,text,text,numeric),public.financial_app_auto_reconcile_linked_products() from public,anon;
grant execute on function public.financial_app_reconciliation_overview(),public.financial_app_reconcile_pair(uuid,uuid,text,text,numeric),public.financial_app_auto_reconcile_linked_products() to authenticated,service_role;
