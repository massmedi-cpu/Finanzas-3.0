begin;

-- Financial App 4.3.0 — observabilidad sample-aware de conciliación y previsión.
-- Deriva métricas del historial canónico; no crea tablas de telemetría ni duplica importes/movimientos.
create or replace function financial_app.matching_observability_core(p_recent_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,financial_app,auth
as $$
declare
  v_email text;
  v_days integer:=least(greatest(coalesce(p_recent_days,90),30),180);
  v_months integer;
  v_payload jsonb;
  v_forecast_recent jsonb:='{}'::jsonb;
  v_forecast_previous jsonb:='{}'::jsonb;
  v_reconciliation_recent jsonb:='{}'::jsonb;
  v_reconciliation_previous jsonb:='{}'::jsonb;
  v_forecast_status text:='insufficient';
  v_reconciliation_status text:='insufficient';
  v_status text:='insufficient';
  v_alerts jsonb:='[]'::jsonb;
  v_recent_matured integer:=0; v_previous_matured integer:=0; v_recent_received integer:=0; v_previous_received integer:=0;
  v_recent_match_rate numeric:=0; v_previous_match_rate numeric:=0; v_recent_date_error numeric:=0; v_previous_date_error numeric:=0;
  v_recent_amount_error numeric:=0; v_previous_amount_error numeric:=0; v_recent_weak_identity numeric:=0; v_previous_weak_identity numeric:=0;
  v_recent_dismissed integer:=0; v_previous_dismissed integer:=0;
  v_recent_decisions integer:=0; v_previous_decisions integer:=0; v_recent_decision_transactions integer:=0; v_previous_decision_transactions integer:=0;
  v_recent_repeat_rate numeric:=0; v_previous_repeat_rate numeric:=0;
  v_recent_pairs integer:=0; v_previous_pairs integer:=0; v_recent_cancelled integer:=0; v_previous_cancelled integer:=0;
  v_recent_cancel_rate numeric:=0; v_previous_cancel_rate numeric:=0; v_recent_avg_confidence numeric:=0; v_previous_avg_confidence numeric:=0;
  v_recent_low_confidence numeric:=0; v_previous_low_confidence numeric:=0; v_recent_manual_pairs integer:=0; v_previous_manual_pairs integer:=0;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_months:=least(18,greatest(4,ceil((v_days*2+62)/30.0)::integer));
  v_payload:=financial_app.forecast_calendar_visible_core(current_date-(v_days*2),v_months);

  with events as(
    select (e.item->>'estimatedDate')::date d,e.item->>'status' status,
      nullif(e.item->'match'->>'dateDifferenceDays','')::numeric date_error,
      nullif(e.item->'match'->>'amountDifference','')::numeric amount_error,
      nullif(e.item->'match'->>'identityRank','')::numeric identity_rank,
      greatest(abs(coalesce(nullif(e.item->>'estimatedAmount','')::numeric,0)),1) estimated_abs
    from jsonb_array_elements(coalesce(v_payload->'events','[]'::jsonb)) e(item)
  ),dismissed as(
    select (e.item->>'estimatedDate')::date d from jsonb_array_elements(coalesce(v_payload->'dismissedEvents','[]'::jsonb)) e(item)
  ),stats as(
    select
      count(*) filter(where status in('received','late') and d between current_date-v_days and current_date)::int recent_matured,
      count(*) filter(where status in('received','late') and d between current_date-(v_days*2) and current_date-v_days-1)::int previous_matured,
      count(*) filter(where status='received' and d between current_date-v_days and current_date)::int recent_received,
      count(*) filter(where status='received' and d between current_date-(v_days*2) and current_date-v_days-1)::int previous_received,
      percentile_cont(.5) within group(order by date_error) filter(where status='received' and d between current_date-v_days and current_date) recent_date_error,
      percentile_cont(.5) within group(order by date_error) filter(where status='received' and d between current_date-(v_days*2) and current_date-v_days-1) previous_date_error,
      percentile_cont(.5) within group(order by amount_error/estimated_abs) filter(where status='received' and d between current_date-v_days and current_date) recent_amount_error,
      percentile_cont(.5) within group(order by amount_error/estimated_abs) filter(where status='received' and d between current_date-(v_days*2) and current_date-v_days-1) previous_amount_error,
      avg(case when identity_rank>=3 then 1.0 else 0 end) filter(where status='received' and d between current_date-v_days and current_date) recent_weak_identity,
      avg(case when identity_rank>=3 then 1.0 else 0 end) filter(where status='received' and d between current_date-(v_days*2) and current_date-v_days-1) previous_weak_identity
    from events
  ),dismissed_stats as(
    select count(*) filter(where d between current_date-v_days and current_date)::int recent_dismissed,
      count(*) filter(where d between current_date-(v_days*2) and current_date-v_days-1)::int previous_dismissed from dismissed
  )
  select s.recent_matured,s.previous_matured,s.recent_received,s.previous_received,
    coalesce(s.recent_date_error,0),coalesce(s.previous_date_error,0),coalesce(s.recent_amount_error,0),coalesce(s.previous_amount_error,0),
    coalesce(s.recent_weak_identity,0),coalesce(s.previous_weak_identity,0),d.recent_dismissed,d.previous_dismissed
  into v_recent_matured,v_previous_matured,v_recent_received,v_previous_received,v_recent_date_error,v_previous_date_error,
    v_recent_amount_error,v_previous_amount_error,v_recent_weak_identity,v_previous_weak_identity,v_recent_dismissed,v_previous_dismissed
  from stats s cross join dismissed_stats d;

  v_recent_match_rate:=case when v_recent_matured>0 then v_recent_received::numeric/v_recent_matured else 0 end;
  v_previous_match_rate:=case when v_previous_matured>0 then v_previous_received::numeric/v_previous_matured else 0 end;

  select count(*) filter(where created_at>=now()-make_interval(days=>v_days))::int,
    count(*) filter(where created_at>=now()-make_interval(days=>v_days*2) and created_at<now()-make_interval(days=>v_days))::int,
    count(distinct transaction_id) filter(where created_at>=now()-make_interval(days=>v_days))::int,
    count(distinct transaction_id) filter(where created_at>=now()-make_interval(days=>v_days*2) and created_at<now()-make_interval(days=>v_days))::int
  into v_recent_decisions,v_previous_decisions,v_recent_decision_transactions,v_previous_decision_transactions
  from financial_app.reconciliation_decisions;

  v_recent_repeat_rate:=case when v_recent_decisions>0 then greatest(v_recent_decisions-v_recent_decision_transactions,0)::numeric/v_recent_decisions else 0 end;
  v_previous_repeat_rate:=case when v_previous_decisions>0 then greatest(v_previous_decisions-v_previous_decision_transactions,0)::numeric/v_previous_decisions else 0 end;

  select
    count(*) filter(where created_at>=now()-make_interval(days=>v_days))::int,
    count(*) filter(where created_at>=now()-make_interval(days=>v_days*2) and created_at<now()-make_interval(days=>v_days))::int,
    count(*) filter(where cancelled_at>=now()-make_interval(days=>v_days))::int,
    count(*) filter(where cancelled_at>=now()-make_interval(days=>v_days*2) and cancelled_at<now()-make_interval(days=>v_days))::int,
    coalesce(avg(confidence) filter(where created_at>=now()-make_interval(days=>v_days) and status='matched'),0),
    coalesce(avg(confidence) filter(where created_at>=now()-make_interval(days=>v_days*2) and created_at<now()-make_interval(days=>v_days) and status='matched'),0),
    coalesce(avg(case when confidence<90 then 1.0 else 0 end) filter(where created_at>=now()-make_interval(days=>v_days) and status='matched'),0),
    coalesce(avg(case when confidence<90 then 1.0 else 0 end) filter(where created_at>=now()-make_interval(days=>v_days*2) and created_at<now()-make_interval(days=>v_days) and status='matched'),0),
    count(*) filter(where created_at>=now()-make_interval(days=>v_days) and method='manual_exact')::int,
    count(*) filter(where created_at>=now()-make_interval(days=>v_days*2) and created_at<now()-make_interval(days=>v_days) and method='manual_exact')::int
  into v_recent_pairs,v_previous_pairs,v_recent_cancelled,v_previous_cancelled,v_recent_avg_confidence,v_previous_avg_confidence,
    v_recent_low_confidence,v_previous_low_confidence,v_recent_manual_pairs,v_previous_manual_pairs
  from financial_app.reconciliation_pairs;

  v_recent_cancel_rate:=case when v_recent_pairs+v_recent_cancelled>0 then v_recent_cancelled::numeric/(v_recent_pairs+v_recent_cancelled) else 0 end;
  v_previous_cancel_rate:=case when v_previous_pairs+v_previous_cancelled>0 then v_previous_cancelled::numeric/(v_previous_pairs+v_previous_cancelled) else 0 end;

  if v_recent_matured>=8 then
    if v_recent_match_rate<.60 or (v_previous_matured>=8 and v_previous_match_rate-v_recent_match_rate>=.20) or v_recent_weak_identity>.30 or v_recent_amount_error>.40 then v_forecast_status:='degraded';
    elsif v_recent_match_rate<.75 or (v_previous_matured>=8 and v_previous_match_rate-v_recent_match_rate>=.10) or v_recent_date_error>10 or v_recent_amount_error>.25 or v_recent_weak_identity>.15 then v_forecast_status:='watch';
    else v_forecast_status:='healthy'; end if;
  end if;

  if v_recent_pairs>=10 or v_recent_decisions>=5 then
    if v_recent_cancel_rate>.20 or v_recent_low_confidence>.25 or v_recent_repeat_rate>.35 then v_reconciliation_status:='degraded';
    elsif v_recent_cancel_rate>.10 or v_recent_low_confidence>.15 or v_recent_repeat_rate>.20 then v_reconciliation_status:='watch';
    else v_reconciliation_status:='healthy'; end if;
  end if;

  if v_forecast_status='degraded' or v_reconciliation_status='degraded' then v_status:='degraded';
  elsif v_forecast_status='watch' or v_reconciliation_status='watch' then v_status:='watch';
  elsif v_forecast_status='healthy' or v_reconciliation_status='healthy' then v_status:='healthy'; end if;

  if v_forecast_status='degraded' then v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object('scope','forecast','severity','high','code','forecast_quality_degraded','message','La calidad reciente de las previsiones ha empeorado de forma significativa.'));
  elsif v_forecast_status='watch' then v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object('scope','forecast','severity','medium','code','forecast_quality_watch','message','La calidad reciente de las previsiones necesita seguimiento.')); end if;
  if v_reconciliation_status='degraded' then v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object('scope','reconciliation','severity','high','code','reconciliation_quality_degraded','message','La calidad reciente de la conciliación ha empeorado de forma significativa.'));
  elsif v_reconciliation_status='watch' then v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object('scope','reconciliation','severity','medium','code','reconciliation_quality_watch','message','La calidad reciente de la conciliación necesita seguimiento.')); end if;

  v_forecast_recent:=jsonb_build_object('matured',v_recent_matured,'received',v_recent_received,'late',greatest(v_recent_matured-v_recent_received,0),'matchRate',round(v_recent_match_rate,4),'dismissed',v_recent_dismissed,'medianDateErrorDays',round(v_recent_date_error,2),'medianAmountErrorRatio',round(v_recent_amount_error,4),'weakIdentityRate',round(v_recent_weak_identity,4));
  v_forecast_previous:=jsonb_build_object('matured',v_previous_matured,'received',v_previous_received,'late',greatest(v_previous_matured-v_previous_received,0),'matchRate',round(v_previous_match_rate,4),'dismissed',v_previous_dismissed,'medianDateErrorDays',round(v_previous_date_error,2),'medianAmountErrorRatio',round(v_previous_amount_error,4),'weakIdentityRate',round(v_previous_weak_identity,4));
  v_reconciliation_recent:=jsonb_build_object('decisions',v_recent_decisions,'distinctTransactions',v_recent_decision_transactions,'repeatDecisionRate',round(v_recent_repeat_rate,4),'pairsCreated',v_recent_pairs,'pairsCancelled',v_recent_cancelled,'cancelRate',round(v_recent_cancel_rate,4),'averageConfidence',round(v_recent_avg_confidence,2),'lowConfidenceRate',round(v_recent_low_confidence,4),'manualPairs',v_recent_manual_pairs);
  v_reconciliation_previous:=jsonb_build_object('decisions',v_previous_decisions,'distinctTransactions',v_previous_decision_transactions,'repeatDecisionRate',round(v_previous_repeat_rate,4),'pairsCreated',v_previous_pairs,'pairsCancelled',v_previous_cancelled,'cancelRate',round(v_previous_cancel_rate,4),'averageConfidence',round(v_previous_avg_confidence,2),'lowConfidenceRate',round(v_previous_low_confidence,4),'manualPairs',v_previous_manual_pairs);

  return jsonb_build_object(
    'version','4.3.0','generatedAt',now(),'windowDays',v_days,'status',v_status,
    'releaseGate',jsonb_build_object('pass',v_status<>'degraded','status',v_status,'sampleAware',true),
    'forecast',jsonb_build_object('status',v_forecast_status,'sampleSufficient',v_recent_matured>=8,'recent',v_forecast_recent,'previous',v_forecast_previous,'trend',jsonb_build_object('matchRateDelta',round(v_recent_match_rate-v_previous_match_rate,4),'dateErrorDeltaDays',round(v_recent_date_error-v_previous_date_error,2),'amountErrorRatioDelta',round(v_recent_amount_error-v_previous_amount_error,4))),
    'reconciliation',jsonb_build_object('status',v_reconciliation_status,'sampleSufficient',(v_recent_pairs>=10 or v_recent_decisions>=5),'recent',v_reconciliation_recent,'previous',v_reconciliation_previous,'trend',jsonb_build_object('cancelRateDelta',round(v_recent_cancel_rate-v_previous_cancel_rate,4),'repeatDecisionRateDelta',round(v_recent_repeat_rate-v_previous_repeat_rate,4),'confidenceDelta',round(v_recent_avg_confidence-v_previous_avg_confidence,2))),
    'alerts',v_alerts,
    'rules',jsonb_build_object('forecastMinimumSample',8,'reconciliationMinimumPairs',10,'reconciliationMinimumDecisions',5,'comparisonWindowDays',v_days,'noFinancialValuesStored',true,'derivedFromCanonicalHistory',true)
  );
end
$$;

revoke all on function financial_app.matching_observability_core(integer) from public,anon;
grant execute on function financial_app.matching_observability_core(integer) to authenticated,service_role;

create or replace function public.financial_app_matching_observability(p_recent_days integer default 90)
returns jsonb
language sql
stable
set search_path=pg_catalog,financial_app
as $$ select financial_app.matching_observability_core(p_recent_days) $$;
revoke all on function public.financial_app_matching_observability(integer) from public,anon;
grant execute on function public.financial_app_matching_observability(integer) to authenticated,service_role;

insert into financial_app.app_meta(key,value,updated_at)
values ('app_version',to_jsonb('4.3.0'::text),now()),('target_version',to_jsonb('4.3.0'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

notify pgrst,'reload schema';
commit;
