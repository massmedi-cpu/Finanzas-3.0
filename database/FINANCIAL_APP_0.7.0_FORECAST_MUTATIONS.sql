-- Financial App 0.7.0 — Forecast schema, persistence and mutation layer
-- Applied to Supabase project ulxsvuksrghjgcjfuegv before the 0.7.0 preview.

alter table financial_app.forecasts add column if not exists account_id uuid references financial_app.accounts(id);
alter table financial_app.forecasts add column if not exists notes text;
alter table financial_app.forecasts add column if not exists created_by text;
create index if not exists forecasts_account_date_idx on financial_app.forecasts(account_id,predicted_date);
create index if not exists forecasts_matched_transaction_id_idx on financial_app.forecasts(matched_transaction_id) where matched_transaction_id is not null;

create table if not exists financial_app.forecast_occurrences(
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references financial_app.forecasts(id) on delete cascade,
  occurrence_date date not null,
  predicted_amount numeric not null,
  status text not null default 'pending' check(status in('pending','consolidated','cancelled')),
  matched_transaction_id uuid references financial_app.transactions(id),
  original_prediction jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(forecast_id,occurrence_date)
);
create index if not exists forecast_occurrences_date_idx on financial_app.forecast_occurrences(occurrence_date,status);
create index if not exists forecast_occurrences_forecast_idx on financial_app.forecast_occurrences(forecast_id);
create index if not exists forecast_occurrences_matched_idx on financial_app.forecast_occurrences(matched_transaction_id) where matched_transaction_id is not null;

create table if not exists financial_app.forecast_history(
  id uuid primary key default gen_random_uuid(), forecast_id uuid not null references financial_app.forecasts(id) on delete cascade,
  action text not null, before_value jsonb, after_value jsonb, changed_by text, changed_at timestamptz not null default now()
);
create index if not exists forecast_history_forecast_idx on financial_app.forecast_history(forecast_id,changed_at desc);
alter table financial_app.forecasts enable row level security;
alter table financial_app.forecast_occurrences enable row level security;
alter table financial_app.forecast_history enable row level security;
revoke all on financial_app.forecasts from anon,authenticated;
revoke all on financial_app.forecast_occurrences from anon,authenticated;
revoke all on financial_app.forecast_history from anon,authenticated;
insert into financial_app.app_meta(key,value) values('schema_version','"0.7.0"'::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now();

create or replace function financial_app.forecast_refresh_core(p_end date default (current_date + 180)) returns void
language plpgsql volatile security definer set search_path='pg_catalog','financial_app','auth' as $$
begin
  if financial_app.authorized_email() is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_end < current_date or p_end > current_date + 730 then raise exception 'invalid horizon'; end if;
  insert into financial_app.forecast_occurrences(forecast_id,occurrence_date,predicted_amount,status,original_prediction)
  select f.id,x.d,f.predicted_amount,'pending',jsonb_build_object('date',x.d,'amount',f.predicted_amount,'generatedAt',now())
  from financial_app.forecasts f cross join lateral (
    select f.predicted_date::date d where f.recurrence_rule is null
    union all
    select case coalesce(f.recurrence_rule->>'frequency','monthly')
      when 'weekly' then (f.predicted_date + make_interval(weeks => n * greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))))::date
      when 'yearly' then (f.predicted_date + make_interval(years => n * greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))))::date
      else (f.predicted_date + make_interval(months => n * greatest(1,coalesce((f.recurrence_rule->>'interval')::int,1))))::date end
    from generate_series(0,120) n where f.recurrence_rule is not null
  ) x
  where f.status <> 'cancelled'::financial_app.forecast_status and x.d <= p_end and x.d <= coalesce(nullif(f.recurrence_rule->>'until','')::date,p_end)
  on conflict(forecast_id,occurrence_date) do update set predicted_amount=excluded.predicted_amount,original_prediction=excluded.original_prediction,updated_at=now() where financial_app.forecast_occurrences.status='pending';
  with candidates as (
    select o.id occurrence_id,t.id transaction_id,row_number() over(partition by o.id order by abs(coalesce(t.effective_date,t.source_date)-o.occurrence_date),abs(t.source_amount-o.predicted_amount),t.source_id) rn
    from financial_app.forecast_occurrences o join financial_app.forecasts f on f.id=o.forecast_id join financial_app.transactions t on t.account_id=f.account_id
      and t.source_missing=false and t.is_duplicate=false and coalesce(t.effective_date,t.source_date) between o.occurrence_date-5 and o.occurrence_date+5
      and sign(t.source_amount)=sign(o.predicted_amount) and abs(t.source_amount-o.predicted_amount)<=greatest(2,abs(o.predicted_amount)*0.12)
      and (f.counterparty is null or lower(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),'')) like '%'||lower(f.counterparty)||'%' or lower(f.counterparty) like '%'||lower(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),''))||'%')
    where o.status='pending' and o.occurrence_date<=current_date+5
  ) update financial_app.forecast_occurrences o set status='consolidated',matched_transaction_id=c.transaction_id,updated_at=now() from candidates c where c.occurrence_id=o.id and c.rn=1;
end $$;
revoke all on function financial_app.forecast_refresh_core(date) from public,anon,authenticated;

create or replace function financial_app.upsert_forecast_core(p_id uuid,p_title text,p_date date,p_amount numeric,p_category text default null,p_subcategory text default null,p_counterparty text default null,p_recurrence jsonb default null,p_notes text default null,p_confidence numeric default 1,p_explanation jsonb default null) returns uuid
language plpgsql volatile security definer set search_path='pg_catalog','financial_app','auth' as $$
declare v_email text; v_account uuid; v_id uuid; v_before jsonb; v_after jsonb; v_freq text; v_interval int;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'title required'; end if;
  if p_date is null or p_amount is null or p_amount=0 then raise exception 'date and non-zero amount required'; end if;
  if p_date < current_date-366 or p_date > current_date+1825 then raise exception 'date out of range'; end if;
  if p_recurrence is not null then v_freq:=coalesce(p_recurrence->>'frequency','monthly'); v_interval:=greatest(1,coalesce((p_recurrence->>'interval')::int,1)); if v_freq not in('weekly','monthly','yearly') or v_interval>24 then raise exception 'invalid recurrence'; end if; if nullif(p_recurrence->>'until','') is not null and (p_recurrence->>'until')::date < p_date then raise exception 'invalid recurrence end'; end if; end if;
  select id into v_account from financial_app.accounts where active=true and account_role='operating' order by created_at limit 1; if v_account is null then raise exception 'operating account missing'; end if;
  if p_id is null then
    insert into financial_app.forecasts(title,predicted_date,predicted_amount,category,subcategory,counterparty,recurrence_rule,confidence,explanation,status,account_id,notes,created_by,original_prediction)
    values(trim(p_title),p_date,p_amount,nullif(trim(p_category),''),nullif(trim(p_subcategory),''),nullif(trim(p_counterparty),''),p_recurrence,least(1,greatest(0,coalesce(p_confidence,1))),coalesce(p_explanation,jsonb_build_object('source','manual')),case when p_recurrence is null then 'manual'::financial_app.forecast_status else 'recurring'::financial_app.forecast_status end,v_account,nullif(trim(p_notes),''),v_email,jsonb_build_object('date',p_date,'amount',p_amount)) returning id into v_id;
    select to_jsonb(f) into v_after from financial_app.forecasts f where f.id=v_id; insert into financial_app.forecast_history(forecast_id,action,before_value,after_value,changed_by) values(v_id,'create',null,v_after,v_email);
  else
    select to_jsonb(f) into v_before from financial_app.forecasts f where f.id=p_id; if v_before is null then raise exception 'forecast not found'; end if;
    update financial_app.forecasts set title=trim(p_title),predicted_date=p_date,predicted_amount=p_amount,category=nullif(trim(p_category),''),subcategory=nullif(trim(p_subcategory),''),counterparty=nullif(trim(p_counterparty),''),recurrence_rule=p_recurrence,confidence=least(1,greatest(0,coalesce(p_confidence,1))),explanation=coalesce(p_explanation,explanation),status=case when p_recurrence is null then 'manual'::financial_app.forecast_status else 'recurring'::financial_app.forecast_status end,account_id=coalesce(account_id,v_account),notes=nullif(trim(p_notes),''),updated_at=now() where id=p_id returning id into v_id;
    delete from financial_app.forecast_occurrences where forecast_id=v_id and status='pending'; select to_jsonb(f) into v_after from financial_app.forecasts f where f.id=v_id; insert into financial_app.forecast_history(forecast_id,action,before_value,after_value,changed_by) values(v_id,'update',v_before,v_after,v_email);
  end if;
  perform financial_app.forecast_refresh_core(current_date+365); return v_id;
end $$;
revoke all on function financial_app.upsert_forecast_core(uuid,text,date,numeric,text,text,text,jsonb,text,numeric,jsonb) from public,anon,authenticated;

create or replace function financial_app.cancel_forecast_core(p_id uuid) returns boolean language plpgsql volatile security definer set search_path='pg_catalog','financial_app','auth' as $$
declare v_email text; v_before jsonb; v_after jsonb;
begin
  v_email:=financial_app.authorized_email(); if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select to_jsonb(f) into v_before from financial_app.forecasts f where f.id=p_id; if v_before is null then raise exception 'forecast not found'; end if;
  update financial_app.forecasts set status='cancelled',updated_at=now() where id=p_id; update financial_app.forecast_occurrences set status='cancelled',updated_at=now() where forecast_id=p_id and status='pending';
  select to_jsonb(f) into v_after from financial_app.forecasts f where f.id=p_id; insert into financial_app.forecast_history(forecast_id,action,before_value,after_value,changed_by) values(p_id,'cancel',v_before,v_after,v_email); return true;
end $$;
revoke all on function financial_app.cancel_forecast_core(uuid) from public,anon,authenticated;
