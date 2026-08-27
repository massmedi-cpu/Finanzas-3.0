begin;

-- Financial App 4.0.0 — automatización segura y acotada de movimientos seleccionados.
-- Reutiliza reglas, asociación documental y conciliación existentes sin abrir cores privilegiados al cliente.

create table if not exists financial_app.automation_runs(
  id uuid primary key default gen_random_uuid(),
  transaction_ids uuid[] not null,
  processed integer not null check(processed between 1 and 200),
  rules_matched integer not null default 0,
  rules_applied integer not null default 0,
  documents_linked integer not null default 0,
  reconciliation_pairs integer not null default 0,
  document_review_remaining integer not null default 0,
  reconciliation_remaining integer not null default 0,
  review_remaining integer not null default 0,
  run_by text not null,
  created_at timestamptz not null default now()
);

alter table financial_app.automation_runs enable row level security;
revoke all on table financial_app.automation_runs from public,anon,authenticated;
create index if not exists automation_runs_created_idx on financial_app.automation_runs(created_at desc);

create or replace function financial_app.automate_transactions_core(p_transaction_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_ids uuid[];
  v_count integer;
  v_existing integer;
  v_tx_id uuid;
  v_rule record;
  v_result jsonb;
  v_matches jsonb;
  v_delta integer:=0;
  v_rules_matched integer:=0;
  v_rules_applied integer:=0;
  v_documents_linked integer:=0;
  v_pairs integer:=0;
  v_document_review integer:=0;
  v_reconciliation_remaining integer:=0;
  v_review_remaining integer:=0;
  v_pair record;
  v_run_id uuid;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
    into v_ids
  from (select distinct id from unnest(coalesce(p_transaction_ids,array[]::uuid[])) id where id is not null) q;

  v_count:=cardinality(v_ids);
  if v_count=0 then raise exception 'no_transactions_selected'; end if;
  if v_count>200 then raise exception 'bulk_limit_exceeded'; end if;

  select count(*) into v_existing
  from financial_app.transactions t
  where t.id=any(v_ids);
  if v_existing<>v_count then raise exception 'invalid_transaction_selection'; end if;

  -- 1) Reaplica el motor canónico de reglas solo a la selección.
  -- Respeta exactamente la prioridad y stop_processing del trigger de ingesta.
  foreach v_tx_id in array v_ids loop
    for v_rule in
      select id,stop_processing
      from financial_app.transaction_rules
      where active=true
      order by priority asc,created_at asc,id asc
    loop
      v_result:=financial_app.apply_rule_to_transaction_internal(v_rule.id,v_tx_id,'automation_safe',v_email);
      if coalesce((v_result->>'matched')::boolean,false) then v_rules_matched:=v_rules_matched+1; end if;
      if coalesce((v_result->>'applied')::boolean,false) then
        v_rules_applied:=v_rules_applied+1;
        if v_rule.stop_processing then exit; end if;
      end if;
    end loop;
  end loop;

  -- 2) Coincidencia exacta 1↔1 de Google Drive, calculada contra todo el universo
  -- de movimientos para no apropiarse de un documento ambiguo fuera de la selección.
  with tx as (
    select t.*,
      financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date) match_date,
      lower(coalesce(t.counterparty_override,t.source_counterparty,'')||' '||coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept,'')) match_text
    from financial_app.transactions t
    where t.source_missing=false and t.is_duplicate=false
  ), candidates as (
    select d.id document_id,tx.id transaction_id,
      count(*) over(partition by d.id) document_candidates,
      count(*) over(partition by tx.id) transaction_candidates
    from financial_app.documents d
    join tx on tx.match_date=d.document_date
      and abs(abs(tx.source_amount)-abs(d.amount))<=0.01
      and d.merchant is not null and trim(d.merchant)<>''
      and regexp_replace(tx.match_text,'[^a-z0-9áéíóúüñ]+','','g') like '%'||regexp_replace(lower(d.merchant),'[^a-z0-9áéíóúüñ]+','','g')||'%'
    where d.storage_provider='google_drive'
      and d.archived_at is null
      and d.document_date is not null
      and d.amount is not null
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
  ), ins as (
    insert into financial_app.transaction_documents(transaction_id,document_id,association_origin,confidence,created_at)
    select transaction_id,document_id,'drive_exact',1.0,now()
    from candidates
    where transaction_id=any(v_ids) and document_candidates=1 and transaction_candidates=1
    on conflict(transaction_id,document_id) do nothing
    returning 1
  )
  select count(*) into v_delta from ins;
  v_documents_linked:=v_documents_linked+v_delta;

  -- 3) Coincidencias de confianza alta: importe exacto, comercio coincidente,
  -- fecha próxima y margen inequívoco respecto al segundo candidato del documento.
  with docs as (
    select d.*,coalesce(nullif(d.ocr_data->>'chargeDate','')::date,d.document_date) match_date
    from financial_app.documents d
    where d.archived_at is null
      and d.document_date is not null
      and d.amount is not null
      and d.amount<>0
      and not(d.ocr_data?'installmentAmount')
      and not exists(select 1 from financial_app.transaction_documents td where td.document_id=d.id)
  ), tx as (
    select t.*,
      financial_app.transaction_match_date(t.source_original_concept,t.effective_date,t.source_date) match_date,
      lower(coalesce(t.counterparty_override,t.source_counterparty,'')||' '||coalesce(t.normalized_concept_override,t.source_normalized_concept,t.source_original_concept,'')) match_text
    from financial_app.transactions t
    where t.source_missing=false and t.is_duplicate=false
  ), candidates as (
    select d.id document_id,tx.id transaction_id,
      abs(tx.match_date-d.match_date) days_diff,
      abs(abs(tx.source_amount)-abs(d.amount)) amount_diff,
      case when d.merchant is not null and trim(d.merchant)<>''
        and regexp_replace(tx.match_text,'[^a-z0-9áéíóúüñ]+','','g') like '%'||regexp_replace(lower(d.merchant),'[^a-z0-9áéíóúüñ]+','','g')||'%'
        then 20 else 0 end merchant_score,
      (case when abs(abs(tx.source_amount)-abs(d.amount))<=0.01 then 55
            when abs(abs(tx.source_amount)-abs(d.amount))<=0.50 then 45
            when abs(abs(tx.source_amount)-abs(d.amount))<=greatest(1,abs(d.amount)*0.05) then 35 else 20 end
       +case when abs(tx.match_date-d.match_date)=0 then 25
             when abs(tx.match_date-d.match_date)=1 then 22
             when abs(tx.match_date-d.match_date)<=3 then 18 else 10 end
       +case when d.merchant is not null and trim(d.merchant)<>''
             and regexp_replace(tx.match_text,'[^a-z0-9áéíóúüñ]+','','g') like '%'||regexp_replace(lower(d.merchant),'[^a-z0-9áéíóúüñ]+','','g')||'%'
             then 20 else 0 end)::numeric score
    from docs d
    join tx on tx.match_date between d.match_date-7 and d.match_date+7
      and abs(abs(tx.source_amount)-abs(d.amount))<=greatest(3,abs(d.amount)*0.15)
  ), ranked as (
    select c.*,
      row_number() over(partition by document_id order by score desc,amount_diff,days_diff,transaction_id) rn,
      lead(score) over(partition by document_id order by score desc,amount_diff,days_diff,transaction_id) second_score,
      count(*) over(partition by document_id) candidate_count
    from candidates c
  ), ins as (
    insert into financial_app.transaction_documents(transaction_id,document_id,association_origin,confidence,created_at)
    select transaction_id,document_id,'auto',least(1,score/100.0),now()
    from ranked
    where transaction_id=any(v_ids)
      and rn=1
      and score>=93
      and amount_diff<=0.01
      and days_diff<=3
      and merchant_score=20
      and (candidate_count=1 or second_score is null or score-second_score>=8)
    on conflict(transaction_id,document_id) do nothing
    returning 1
  )
  select count(*) into v_delta from ins;
  v_documents_linked:=v_documents_linked+v_delta;

  -- 4) Conciliación automática solo para parejas de traspasos internos 1↔1.
  -- Ambas partes deben estar seleccionadas, pendientes, compensar al céntimo y no tener otra pareja posible.
  for v_pair in
    with eligible as (
      select t.*
      from financial_app.transactions t
      where t.id=any(v_ids)
        and t.is_internal_transfer
        and not t.source_missing
        and not t.is_duplicate
        and financial_app.effective_reconciliation_status(t)='pending'
        and not exists(
          select 1 from financial_app.reconciliation_pairs rp
          where rp.status='matched' and (rp.transaction_a_id=t.id or rp.transaction_b_id=t.id)
        )
    ), candidates as (
      select a.id a_id,b.id b_id
      from eligible a
      join eligible b on a.id<b.id
        and coalesce(a.source_identifier,'')<>coalesce(b.source_identifier,'')
        and abs(coalesce(a.source_amount,0)+coalesce(b.source_amount,0))<=0.01
        and abs(coalesce(a.effective_date,a.source_date)-coalesce(b.effective_date,b.source_date))<=3
    ), degrees as (
      select id,count(*)::integer n
      from (
        select a_id id from candidates
        union all
        select b_id id from candidates
      ) d
      group by id
    )
    select c.a_id,c.b_id
    from candidates c
    join degrees da on da.id=c.a_id and da.n=1
    join degrees db on db.id=c.b_id and db.n=1
    order by c.a_id,c.b_id
  loop
    perform financial_app.reconcile_pair_core(v_pair.a_id,v_pair.b_id,'Pareja exacta 1↔1 detectada por Financial App 4.0','automation_exact',100);
    v_pairs:=v_pairs+1;
  end loop;

  -- Ambigüedades documentales: siguen siendo trabajo humano; no se fuerza ningún enlace.
  foreach v_tx_id in array v_ids loop
    v_matches:=financial_app.transaction_document_matches_core(v_tx_id);
    if jsonb_array_length(coalesce(v_matches->'linked','[]'::jsonb))=0
       and jsonb_array_length(coalesce(v_matches->'suggestions','[]'::jsonb))>0 then
      v_document_review:=v_document_review+1;
    end if;
  end loop;

  select count(*) into v_reconciliation_remaining
  from financial_app.transactions t
  where t.id=any(v_ids)
    and not t.source_missing
    and not t.is_duplicate
    and financial_app.effective_reconciliation_status(t) in('pending','not_reconciled');

  select count(*) into v_review_remaining
  from financial_app.transactions t
  where t.id=any(v_ids) and t.needs_review=true;

  insert into financial_app.automation_runs(
    transaction_ids,processed,rules_matched,rules_applied,documents_linked,reconciliation_pairs,
    document_review_remaining,reconciliation_remaining,review_remaining,run_by
  ) values(
    v_ids,v_count,v_rules_matched,v_rules_applied,v_documents_linked,v_pairs,
    v_document_review,v_reconciliation_remaining,v_review_remaining,v_email
  ) returning id into v_run_id;

  return jsonb_build_object(
    'ok',true,
    'runId',v_run_id,
    'processed',v_count,
    'updated',v_count,
    'rulesMatched',v_rules_matched,
    'rulesApplied',v_rules_applied,
    'documentsLinked',v_documents_linked,
    'reconciliationPairs',v_pairs,
    'documentReviewRemaining',v_document_review,
    'reconciliationRemaining',v_reconciliation_remaining,
    'reviewRemaining',v_review_remaining
  );
end
$$;

revoke all on function financial_app.automate_transactions_core(uuid[]) from public,anon;
grant execute on function financial_app.automate_transactions_core(uuid[]) to authenticated,service_role;

create or replace function public.financial_app_automate_transactions(p_transaction_ids uuid[])
returns jsonb
language sql
set search_path=pg_catalog,financial_app
as $$ select financial_app.automate_transactions_core(p_transaction_ids) $$;

revoke all on function public.financial_app_automate_transactions(uuid[]) from public,anon;
grant execute on function public.financial_app_automate_transactions(uuid[]) to authenticated,service_role;

-- No se amplían los permisos del autoenlace global: continúa reservado al service_role.
revoke all on function financial_app.auto_link_documents_core() from public,anon,authenticated;
grant execute on function financial_app.auto_link_documents_core() to service_role;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('4.0.0'::text),now()),
  ('target_version',to_jsonb('4.0.0'::text),now())
on conflict(key) do update
set value=excluded.value,updated_at=excluded.updated_at;

notify pgrst,'reload schema';
commit;
