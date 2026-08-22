-- Financial App 1.4.0 · Centro de Control Financiero + cierre mensual
-- Requiere la base estable 1.2.0. No modifica el origen bancario.

create table if not exists financial_app.control_alert_states (
  alert_key text primary key,
  state text not null default 'open' check (state in ('open','resolved','dismissed','snoozed')),
  snoozed_until date,
  note text,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table financial_app.control_alert_states enable row level security;
revoke all on financial_app.control_alert_states from anon, authenticated;

create table if not exists financial_app.month_closes (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  status text not null default 'closed' check (status in ('closed','reopened')),
  snapshot jsonb not null,
  notes text,
  closed_by text not null,
  closed_at timestamptz not null default now(),
  reopened_at timestamptz,
  updated_at timestamptz not null default now(),
  check (month_start = date_trunc('month', month_start)::date)
);
alter table financial_app.month_closes enable row level security;
revoke all on financial_app.month_closes from anon, authenticated;
create index if not exists month_closes_status_month_idx on financial_app.month_closes(status,month_start desc);

create or replace function financial_app.control_month_snapshot_core(p_month date)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_email text:=financial_app.authorized_email();
  v_start date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  v_cf jsonb:='{}'::jsonb;
  v_income numeric:=0; v_expenses numeric:=0; v_net numeric:=0;
  v_needs_review int:=0; v_duplicates int:=0; v_unreconciled int:=0;
  v_budget jsonb:='{}'::jsonb; v_budget_over int:=0; v_unbudgeted numeric:=0;
  v_high_threshold numeric:=0; v_high_expenses jsonb:='[]'::jsonb;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_cf:=financial_app.cash_flow_range_core('custom',(v_end-1),v_start,(v_end-1),null,null,null,null,null);
  v_income:=coalesce((v_cf->>'income')::numeric,0);
  v_expenses:=coalesce((v_cf->>'expenses')::numeric,0);
  v_net:=coalesce((v_cf->>'net')::numeric,0);

  select count(*) filter(where coalesce(t.needs_review,false)),
         count(*) filter(where coalesce(t.is_duplicate,false)),
         count(*) filter(where financial_app.effective_reconciliation_status(t)='not_reconciled')
    into v_needs_review,v_duplicates,v_unreconciled
  from financial_app.transactions t
  where coalesce(t.effective_date,t.source_date)>=v_start
    and coalesce(t.effective_date,t.source_date)<v_end
    and t.source_missing=false;

  v_budget:=financial_app.budget_month_core(v_start);
  v_budget_over:=coalesce((v_budget->>'overBudgetCount')::int,0);
  v_unbudgeted:=coalesce((v_budget->>'unbudgetedSpent')::numeric,0);

  select greatest(100::numeric,coalesce(percentile_cont(0.9) within group(order by abs(amount))::numeric,0)*2)
    into v_high_threshold
  from financial_app.personal_financial_lines()
  where cash_flow_enabled and account_role<>'savings' and cash_flow_override is distinct from false
    and amount<0 and source_missing=false and not is_internal_transfer and not is_duplicate
    and movement_date >= (v_start-interval '90 days')::date and movement_date<v_start;

  with x as (
    select transaction_id,movement_date,amount,category,subcategory,merchant,round(abs(amount),2) expense
    from financial_app.personal_financial_lines()
    where movement_date>=v_start and movement_date<v_end
      and cash_flow_enabled and account_role<>'savings' and cash_flow_override is distinct from false
      and source_missing=false and amount<0 and not is_internal_transfer and not is_duplicate
      and abs(amount)>=v_high_threshold
    order by abs(amount) desc limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'transactionId',transaction_id,'date',movement_date,'amount',amount,'expense',expense,
    'category',category,'subcategory',subcategory,'merchant',merchant
  ) order by expense desc),'[]'::jsonb) into v_high_expenses from x;

  return jsonb_build_object(
    'month',to_char(v_start,'YYYY-MM'),'monthStart',v_start,'monthEnd',(v_end-1),
    'income',round(v_income,2),'expenses',round(v_expenses,2),'net',round(v_net,2),
    'needsReview',v_needs_review,'duplicates',v_duplicates,'unreconciled',v_unreconciled,
    'overBudgetCount',v_budget_over,'unbudgetedSpent',round(v_unbudgeted,2),
    'highExpenseThreshold',round(v_high_threshold,2),'highExpenses',v_high_expenses,
    'closeBlockers',v_needs_review+v_duplicates,
    'closeWarnings',v_unreconciled + case when v_unbudgeted>0 then 1 else 0 end + v_budget_over,
    'closeReady',(v_needs_review+v_duplicates)=0
  );
end$$;

create or replace function financial_app.control_center_core(p_month date default null)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_email text:=financial_app.authorized_email();
  v_start date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  v_snapshot jsonb;
  v_prev_start date:=(v_start-interval '1 month')::date;
  v_prev_snapshot jsonb;
  v_alerts jsonb:='[]'::jsonb; v_history jsonb:='[]'::jsonb; v_closes jsonb:='[]'::jsonb; v_raw jsonb:='[]'::jsonb;
  v_hidden int:=0;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_snapshot:=financial_app.control_month_snapshot_core(v_start);
  v_prev_snapshot:=financial_app.control_month_snapshot_core(v_prev_start);

  with raw_alerts as (
    select jsonb_build_object('key','needs-review:'||(v_snapshot->>'month')||':'||(v_snapshot->>'needsReview'),'type','needs_review','severity','high','title','Movimientos pendientes de revisión','detail',(v_snapshot->>'needsReview')||' movimiento(s) necesitan revisión antes de dar el mes por limpio.','count',(v_snapshot->>'needsReview')::int,'href','/movimientos?review=1&from='||v_start::text||'&to='||(v_end-1)::text) a
    where (v_snapshot->>'needsReview')::int>0
    union all
    select jsonb_build_object('key','duplicates:'||(v_snapshot->>'month')||':'||(v_snapshot->>'duplicates'),'type','duplicates','severity','critical','title','Posibles duplicados','detail',(v_snapshot->>'duplicates')||' movimiento(s) están marcados como duplicados.','count',(v_snapshot->>'duplicates')::int,'href','/movimientos?duplicate=1&from='||v_start::text||'&to='||(v_end-1)::text)
    where (v_snapshot->>'duplicates')::int>0
    union all
    select jsonb_build_object('key','unreconciled:'||(v_snapshot->>'month')||':'||(v_snapshot->>'unreconciled'),'type','reconciliation','severity','medium','title','Conciliación pendiente','detail',(v_snapshot->>'unreconciled')||' movimiento(s) siguen sin conciliar en el periodo.','count',(v_snapshot->>'unreconciled')::int,'href','/movimientos?reconciled=0&from='||v_start::text||'&to='||(v_end-1)::text)
    where (v_snapshot->>'unreconciled')::int>0
    union all
    select jsonb_build_object('key','unbudgeted:'||(v_snapshot->>'month')||':'||(v_snapshot->>'unbudgetedSpent'),'type','budget','severity','medium','title','Gasto sin presupuesto','detail','Hay '||to_char((v_snapshot->>'unbudgetedSpent')::numeric,'FM999G999G990D00')||' € de gasto sin presupuesto asignado.','amount',(v_snapshot->>'unbudgetedSpent')::numeric,'href','/presupuesto')
    where (v_snapshot->>'unbudgetedSpent')::numeric>0
    union all
    select jsonb_build_object('key','over-budget:'||(v_snapshot->>'month')||':'||(v_snapshot->>'overBudgetCount'),'type','budget','severity','high','title','Presupuestos excedidos','detail',(v_snapshot->>'overBudgetCount')||' presupuesto(s) han superado el límite del mes.','count',(v_snapshot->>'overBudgetCount')::int,'href','/presupuesto')
    where (v_snapshot->>'overBudgetCount')::int>0
    union all
    select jsonb_build_object('key','month-close:'||to_char(v_prev_start,'YYYY-MM'),'type','month_close','severity','low','title','Mes anterior sin cerrar','detail','El mes '||to_char(v_prev_start,'MM/YYYY')||' todavía no tiene un cierre financiero confirmado.','month',to_char(v_prev_start,'YYYY-MM'),'href','/control?month='||to_char(v_prev_start,'YYYY-MM'))
    where v_start=date_trunc('month',current_date)::date and not exists(select 1 from financial_app.month_closes mc where mc.month_start=v_prev_start and mc.status='closed')
    union all
    select jsonb_build_object('key','high-expense:'||(x->>'transactionId'),'type','high_expense','severity','medium','title','Gasto inusualmente alto','detail',coalesce(nullif(x->>'merchant',''),'Movimiento')||' · '||to_char((x->>'expense')::numeric,'FM999G999G990D00')||' €','amount',(x->>'expense')::numeric,'date',x->>'date','merchant',x->>'merchant','href','/movimientos/'||(x->>'transactionId'))
    from jsonb_array_elements(v_snapshot->'highExpenses') x
  ) select coalesce(jsonb_agg(a),'[]'::jsonb) into v_raw from raw_alerts;

  with expanded as (
    select x a,s.state,s.snoozed_until,s.note,s.updated_at
    from jsonb_array_elements(v_raw) x
    left join financial_app.control_alert_states s on s.alert_key=x->>'key'
  ), visible as (
    select (a||jsonb_build_object('state',coalesce(state,'open'),'snoozedUntil',snoozed_until,'note',note)) alert
    from expanded
    where coalesce(state,'open')='open' or (state='snoozed' and coalesce(snoozed_until,current_date-1)<current_date)
  ) select coalesce(jsonb_agg(alert order by case alert->>'severity' when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,alert->>'title'),'[]'::jsonb)
  into v_alerts from visible;

  select count(*) into v_hidden
  from jsonb_array_elements(v_raw) x join financial_app.control_alert_states s on s.alert_key=x->>'key'
  where s.state in ('resolved','dismissed') or (s.state='snoozed' and coalesce(s.snoozed_until,current_date)>=current_date);

  select coalesce(jsonb_agg(jsonb_build_object('key',alert_key,'state',state,'snoozedUntil',snoozed_until,'note',note,'updatedAt',updated_at) order by updated_at desc),'[]'::jsonb)
  into v_history from (select * from financial_app.control_alert_states order by updated_at desc limit 20) h;

  select coalesce(jsonb_agg(jsonb_build_object('id',id,'month',to_char(month_start,'YYYY-MM'),'status',status,'snapshot',snapshot,'notes',notes,'closedAt',closed_at,'reopenedAt',reopened_at) order by month_start desc),'[]'::jsonb)
  into v_closes from (select * from financial_app.month_closes order by month_start desc limit 12) c;

  return jsonb_build_object('version',financial_app.current_app_version(),'month',to_char(v_start,'YYYY-MM'),'snapshot',v_snapshot,'previousMonthSnapshot',v_prev_snapshot,
    'alerts',v_alerts,'hiddenAlertCount',v_hidden,'alertHistory',v_history,'closes',v_closes,
    'rules',jsonb_build_object('highExpense','>= max(100 €, 2 × percentil 90 de gastos de los 90 días anteriores)','closeBlockers','duplicados + movimientos pendientes de revisión','closeWarnings','conciliación pendiente + gasto sin presupuesto + presupuestos excedidos'));
end$$;

create or replace function financial_app.set_control_alert_state_core(p_alert_key text,p_action text,p_days int default 7,p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','financial_app','auth'
as $$declare v_email text:=financial_app.authorized_email();v_state text;v_until date;begin
 if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
 if nullif(trim(p_alert_key),'') is null then raise exception 'invalid_alert_key';end if;
 if p_action not in ('open','resolved','dismissed','snoozed') then raise exception 'invalid_action';end if;
 v_state:=p_action;v_until:=case when p_action='snoozed' then current_date+greatest(1,least(coalesce(p_days,7),90)) else null end;
 insert into financial_app.control_alert_states(alert_key,state,snoozed_until,note,first_seen_at,updated_at)
 values(p_alert_key,v_state,v_until,nullif(trim(p_note),''),now(),now())
 on conflict(alert_key) do update set state=excluded.state,snoozed_until=excluded.snoozed_until,note=excluded.note,updated_at=now();
 return jsonb_build_object('ok',true,'key',p_alert_key,'state',v_state,'snoozedUntil',v_until);end$$;

create or replace function financial_app.close_month_core(p_month date,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','financial_app','auth'
as $$declare v_email text:=financial_app.authorized_email();v_start date:=date_trunc('month',p_month)::date;v_snapshot jsonb;v_id uuid;begin
 if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
 if v_start>=date_trunc('month',current_date)::date then raise exception 'only_completed_months_can_be_closed';end if;
 v_snapshot:=financial_app.control_month_snapshot_core(v_start);
 if coalesce((v_snapshot->>'closeBlockers')::int,0)>0 then raise exception 'month_has_blockers';end if;
 insert into financial_app.month_closes(month_start,status,snapshot,notes,closed_by,closed_at,reopened_at,updated_at)
 values(v_start,'closed',v_snapshot,nullif(trim(p_notes),''),v_email,now(),null,now())
 on conflict(month_start) do update set status='closed',snapshot=excluded.snapshot,notes=excluded.notes,closed_by=excluded.closed_by,closed_at=now(),reopened_at=null,updated_at=now() returning id into v_id;
 return jsonb_build_object('ok',true,'id',v_id,'month',to_char(v_start,'YYYY-MM'),'snapshot',v_snapshot);end$$;

create or replace function financial_app.reopen_month_core(p_month date)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','financial_app','auth'
as $$declare v_email text:=financial_app.authorized_email();v_start date:=date_trunc('month',p_month)::date;v_id uuid;begin
 if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
 update financial_app.month_closes set status='reopened',reopened_at=now(),updated_at=now() where month_start=v_start returning id into v_id;
 if v_id is null then raise exception 'month_close_not_found';end if;
 return jsonb_build_object('ok',true,'id',v_id,'month',to_char(v_start,'YYYY-MM'),'status','reopened');end$$;

create or replace function public.financial_app_control_center(p_month date default null)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','financial_app','auth'
as $$select financial_app.control_center_core(p_month);$$;
create or replace function public.financial_app_set_control_alert_state(p_alert_key text,p_action text,p_days int default 7,p_note text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','financial_app','auth'
as $$select financial_app.set_control_alert_state_core(p_alert_key,p_action,p_days,p_note);$$;
create or replace function public.financial_app_close_month(p_month date,p_notes text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','financial_app','auth'
as $$select financial_app.close_month_core(p_month,p_notes);$$;
create or replace function public.financial_app_reopen_month(p_month date)
returns jsonb language sql security definer set search_path to 'pg_catalog','financial_app','auth'
as $$select financial_app.reopen_month_core(p_month);$$;

revoke all on function public.financial_app_control_center(date) from public,anon;
revoke all on function public.financial_app_set_control_alert_state(text,text,int,text) from public,anon;
revoke all on function public.financial_app_close_month(date,text) from public,anon;
revoke all on function public.financial_app_reopen_month(date) from public,anon;
grant execute on function public.financial_app_control_center(date) to authenticated;
grant execute on function public.financial_app_set_control_alert_state(text,text,int,text) to authenticated;
grant execute on function public.financial_app_close_month(date,text) to authenticated;
grant execute on function public.financial_app_reopen_month(date) to authenticated;
revoke all on function financial_app.control_center_core(date) from public,anon,authenticated;
revoke all on function financial_app.control_month_snapshot_core(date) from public,anon,authenticated;
revoke all on function financial_app.set_control_alert_state_core(text,text,int,text) from public,anon,authenticated;
revoke all on function financial_app.close_month_core(date,text) from public,anon,authenticated;
revoke all on function financial_app.reopen_month_core(date) from public,anon,authenticated;
