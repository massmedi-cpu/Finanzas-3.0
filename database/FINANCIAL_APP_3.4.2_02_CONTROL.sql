begin;

create or replace function financial_app.control_month_snapshot_metrics_core(p_month date,p_cash_flow jsonb,p_budget jsonb)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text:=financial_app.authorized_email();
  v_start date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  v_income numeric:=coalesce((p_cash_flow->>'income')::numeric,0);
  v_expenses numeric:=coalesce((p_cash_flow->>'expenses')::numeric,0);
  v_net numeric:=coalesce((p_cash_flow->>'net')::numeric,0);
  v_needs_review int:=0;v_duplicates int:=0;v_unreconciled int:=0;
  v_budget_over int:=coalesce((p_budget->>'overBudgetCount')::int,0);
  v_unbudgeted numeric:=coalesce((p_budget->>'unbudgetedSpent')::numeric,0);
  v_high_threshold numeric:=0;v_high_expenses jsonb:='[]'::jsonb;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  if p_cash_flow is null or p_budget is null then raise exception 'control_snapshot_inputs_required';end if;

  select count(*) filter(where coalesce(t.needs_review,false)),
         count(*) filter(where coalesce(t.is_duplicate,false)),
         count(*) filter(where financial_app.effective_reconciliation_status(t)='not_reconciled')
  into v_needs_review,v_duplicates,v_unreconciled
  from financial_app.transactions t
  where coalesce(t.effective_date,t.source_date)>=v_start
    and coalesce(t.effective_date,t.source_date)<v_end
    and t.source_missing=false;

  select greatest(100::numeric,coalesce(percentile_cont(0.9) within group(order by abs(amount))::numeric,0)*2)
  into v_high_threshold
  from financial_app.personal_financial_lines()
  where cash_flow_enabled and account_role<>'savings'
    and cash_flow_override is distinct from false
    and amount<0 and source_missing=false
    and not is_internal_transfer and not is_duplicate
    and movement_date >= (v_start-interval '90 days')::date and movement_date<v_start;

  with x as(
    select transaction_id,movement_date,amount,category,subcategory,merchant,round(abs(amount),2) expense
    from financial_app.personal_financial_lines()
    where movement_date>=v_start and movement_date<v_end
      and cash_flow_enabled and account_role<>'savings'
      and cash_flow_override is distinct from false
      and source_missing=false and amount<0
      and not is_internal_transfer and not is_duplicate
      and abs(amount)>=v_high_threshold
    order by abs(amount) desc limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'transactionId',transaction_id,'date',movement_date,'amount',amount,'expense',expense,
    'category',category,'subcategory',subcategory,'merchant',merchant
  ) order by expense desc),'[]'::jsonb)
  into v_high_expenses from x;

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
end
$function$;

create or replace function financial_app.control_month_snapshot_core(p_month date)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text:=financial_app.authorized_email();
  v_start date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  v_cf jsonb;v_budget jsonb;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  v_cf:=financial_app.cash_flow_range_core('custom',(v_end-1),v_start,(v_end-1),null,null,null,null,null);
  v_budget:=financial_app.budget_month_core(v_start);
  return financial_app.control_month_snapshot_metrics_core(v_start,v_cf,v_budget);
end
$function$;

create or replace function financial_app.control_alert_bundle_core(p_month date,p_snapshot jsonb)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text:=financial_app.authorized_email();
  v_start date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month')::date;
  v_prev_start date:=(v_start-interval '1 month')::date;
  v_raw jsonb:='[]'::jsonb;v_alerts jsonb:='[]'::jsonb;v_hidden int:=0;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  if p_snapshot is null then raise exception 'control_snapshot_required';end if;

  with raw_alerts as(
    select jsonb_build_object('key','needs-review:'||(p_snapshot->>'month')||':'||(p_snapshot->>'needsReview'),'type','needs_review','severity','high','title','Movimientos pendientes de revisión','detail',(p_snapshot->>'needsReview')||' movimiento(s) necesitan revisión antes de dar el mes por limpio.','count',(p_snapshot->>'needsReview')::int,'href','/movimientos?review=1&from='||v_start::text||'&to='||(v_end-1)::text) a
    where (p_snapshot->>'needsReview')::int>0
    union all
    select jsonb_build_object('key','duplicates:'||(p_snapshot->>'month')||':'||(p_snapshot->>'duplicates'),'type','duplicates','severity','critical','title','Posibles duplicados','detail',(p_snapshot->>'duplicates')||' movimiento(s) están marcados como duplicados.','count',(p_snapshot->>'duplicates')::int,'href','/movimientos?duplicate=1&from='||v_start::text||'&to='||(v_end-1)::text)
    where (p_snapshot->>'duplicates')::int>0
    union all
    select jsonb_build_object('key','unreconciled:'||(p_snapshot->>'month')||':'||(p_snapshot->>'unreconciled'),'type','reconciliation','severity','medium','title','Conciliación pendiente','detail',(p_snapshot->>'unreconciled')||' movimiento(s) siguen sin conciliar en el periodo.','count',(p_snapshot->>'unreconciled')::int,'href','/movimientos?reconciled=0&from='||v_start::text||'&to='||(v_end-1)::text)
    where (p_snapshot->>'unreconciled')::int>0
    union all
    select jsonb_build_object('key','unbudgeted:'||(p_snapshot->>'month')||':'||(p_snapshot->>'unbudgetedSpent'),'type','budget','severity','medium','title','Gasto sin presupuesto','detail','Hay '||to_char((p_snapshot->>'unbudgetedSpent')::numeric,'FM999G999G990D00')||' € de gasto sin presupuesto asignado.','amount',(p_snapshot->>'unbudgetedSpent')::numeric,'href','/presupuesto')
    where (p_snapshot->>'unbudgetedSpent')::numeric>0
    union all
    select jsonb_build_object('key','over-budget:'||(p_snapshot->>'month')||':'||(p_snapshot->>'overBudgetCount'),'type','budget','severity','high','title','Presupuestos excedidos','detail',(p_snapshot->>'overBudgetCount')||' presupuesto(s) han superado el límite del mes.','count',(p_snapshot->>'overBudgetCount')::int,'href','/presupuesto')
    where (p_snapshot->>'overBudgetCount')::int>0
    union all
    select jsonb_build_object('key','month-close:'||to_char(v_prev_start,'YYYY-MM'),'type','month_close','severity','low','title','Mes anterior sin cerrar','detail','El mes '||to_char(v_prev_start,'MM/YYYY')||' todavía no tiene un cierre financiero confirmado.','month',to_char(v_prev_start,'YYYY-MM'),'href','/control?month='||to_char(v_prev_start,'YYYY-MM'))
    where v_start=date_trunc('month',current_date)::date
      and not exists(select 1 from financial_app.month_closes mc where mc.month_start=v_prev_start and mc.status='closed')
    union all
    select jsonb_build_object('key','high-expense:'||(x->>'transactionId'),'type','high_expense','severity','medium','title','Gasto inusualmente alto','detail',coalesce(nullif(x->>'merchant',''),'Movimiento')||' · '||to_char((x->>'expense')::numeric,'FM999G999G990D00')||' €','amount',(x->>'expense')::numeric,'date',x->>'date','merchant',x->>'merchant','href','/movimientos/'||(x->>'transactionId'))
    from jsonb_array_elements(p_snapshot->'highExpenses') x
  )
  select coalesce(jsonb_agg(a),'[]'::jsonb) into v_raw from raw_alerts;

  with expanded as(
    select x a,s.state,s.snoozed_until,s.note,s.updated_at
    from jsonb_array_elements(v_raw) x
    left join financial_app.control_alert_states s on s.alert_key=x->>'key'
  ),visible as(
    select (a||jsonb_build_object('state',coalesce(state,'open'),'snoozedUntil',snoozed_until,'note',note)) alert
    from expanded
    where coalesce(state,'open')='open'
      or (state='snoozed' and coalesce(snoozed_until,current_date-1)<current_date)
  )
  select coalesce(jsonb_agg(alert order by case alert->>'severity' when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,alert->>'title'),'[]'::jsonb)
  into v_alerts from visible;

  select count(*) into v_hidden
  from jsonb_array_elements(v_raw) x
  join financial_app.control_alert_states s on s.alert_key=x->>'key'
  where s.state in ('resolved','dismissed')
     or (s.state='snoozed' and coalesce(s.snoozed_until,current_date)>=current_date);

  return jsonb_build_object('alerts',v_alerts,'hiddenAlertCount',v_hidden);
end
$function$;

create or replace function financial_app.control_center_core(p_month date default null::date)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text:=financial_app.authorized_email();
  v_start date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_snapshot jsonb;v_prev_start date:=(v_start-interval '1 month')::date;v_prev_snapshot jsonb;
  v_bundle jsonb;v_alerts jsonb:='[]'::jsonb;v_history jsonb:='[]'::jsonb;v_closes jsonb:='[]'::jsonb;v_hidden int:=0;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  v_snapshot:=financial_app.control_month_snapshot_core(v_start);
  v_prev_snapshot:=financial_app.control_month_snapshot_core(v_prev_start);
  v_bundle:=financial_app.control_alert_bundle_core(v_start,v_snapshot);
  v_alerts:=coalesce(v_bundle->'alerts','[]'::jsonb);
  v_hidden:=coalesce((v_bundle->>'hiddenAlertCount')::int,0);

  select coalesce(jsonb_agg(jsonb_build_object('key',alert_key,'state',state,'snoozedUntil',snoozed_until,'note',note,'updatedAt',updated_at) order by updated_at desc),'[]'::jsonb)
  into v_history from(select * from financial_app.control_alert_states order by updated_at desc limit 20) h;

  select coalesce(jsonb_agg(jsonb_build_object('id',id,'month',to_char(month_start,'YYYY-MM'),'status',status,'snapshot',snapshot,'notes',notes,'closedAt',closed_at,'reopenedAt',reopened_at) order by month_start desc),'[]'::jsonb)
  into v_closes from(select * from financial_app.month_closes order by month_start desc limit 12) c;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),'month',to_char(v_start,'YYYY-MM'),
    'snapshot',v_snapshot,'previousMonthSnapshot',v_prev_snapshot,
    'alerts',v_alerts,'hiddenAlertCount',v_hidden,'alertHistory',v_history,'closes',v_closes,
    'rules',jsonb_build_object(
      'highExpense','>= max(100 €, 2 × percentil 90 de gastos de los 90 días anteriores)',
      'closeBlockers','duplicados + movimientos pendientes de revisión',
      'closeWarnings','conciliación pendiente + gasto sin presupuesto + presupuestos excedidos'
    )
  );
end
$function$;

revoke execute on function financial_app.control_month_snapshot_metrics_core(date,jsonb,jsonb) from public,anon,authenticated;
revoke execute on function financial_app.control_alert_bundle_core(date,jsonb) from public,anon,authenticated;
grant execute on function financial_app.control_month_snapshot_metrics_core(date,jsonb,jsonb) to service_role;
grant execute on function financial_app.control_alert_bundle_core(date,jsonb) to service_role;

commit;
