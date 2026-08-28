begin;

-- Financial App 6.1.0 — histórico agregado de calidad del matching documental.
-- Guarda exclusivamente métricas agregadas. No persiste IDs, importes, comercios, conceptos ni datos de movimientos/documentos.

create table if not exists financial_app.document_matching_quality_snapshots(
  snapshot_day date primary key,
  captured_at timestamptz not null default now(),
  engine_version text not null,
  active_unlinked integer not null check(active_unlinked>=0),
  with_candidates integer not null check(with_candidates>=0),
  safe_auto integer not null check(safe_auto>=0),
  ambiguous integer not null check(ambiguous>=0),
  high_confidence integer not null check(high_confidence>=0),
  medium_confidence integer not null check(medium_confidence>=0),
  low_confidence integer not null check(low_confidence>=0),
  no_candidates integer not null check(no_candidates>=0),
  candidate_rate numeric(8,5) not null check(candidate_rate between 0 and 1),
  safe_auto_rate numeric(8,5) not null check(safe_auto_rate between 0 and 1),
  ambiguity_rate numeric(8,5) not null check(ambiguity_rate between 0 and 1)
);

revoke all on table financial_app.document_matching_quality_snapshots from public,anon,authenticated;

create or replace function financial_app.document_matching_quality_history_core(
  p_days integer default 90
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_days integer;
  v_result jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_days:=greatest(7,least(coalesce(p_days,90),365));

  select coalesce(jsonb_agg(jsonb_build_object(
    'date',s.snapshot_day,
    'capturedAt',s.captured_at,
    'engineVersion',s.engine_version,
    'activeUnlinked',s.active_unlinked,
    'withCandidates',s.with_candidates,
    'safeAuto',s.safe_auto,
    'ambiguous',s.ambiguous,
    'highConfidence',s.high_confidence,
    'mediumConfidence',s.medium_confidence,
    'lowConfidence',s.low_confidence,
    'noCandidates',s.no_candidates,
    'candidateRate',s.candidate_rate,
    'safeAutoRate',s.safe_auto_rate,
    'ambiguityRate',s.ambiguity_rate
  ) order by s.snapshot_day),'[]'::jsonb)
  into v_result
  from financial_app.document_matching_quality_snapshots s
  where s.snapshot_day >= ((now() at time zone 'Europe/Madrid')::date-(v_days-1));

  return v_result;
end
$function$;

create or replace function financial_app.document_matching_dashboard_core(
  p_limit integer default 8,
  p_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_day date;
  v_payload jsonb;
  v_summary jsonb;
  v_active integer;
  v_with integer;
  v_safe integer;
  v_ambiguous integer;
  v_high integer;
  v_medium integer;
  v_low integer;
  v_none integer;
  v_candidate_rate numeric;
  v_safe_rate numeric;
  v_ambiguity_rate numeric;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  v_day:=(now() at time zone 'Europe/Madrid')::date;
  v_payload:=financial_app.document_matching_observability_core(greatest(1,least(coalesce(p_limit,8),20)));
  v_summary:=coalesce(v_payload->'summary','{}'::jsonb);
  v_active:=greatest(0,coalesce((v_summary->>'activeUnlinked')::integer,0));
  v_with:=greatest(0,coalesce((v_summary->>'withCandidates')::integer,0));
  v_safe:=greatest(0,coalesce((v_summary->>'safeAuto')::integer,0));
  v_ambiguous:=greatest(0,coalesce((v_summary->>'ambiguous')::integer,0));
  v_high:=greatest(0,coalesce((v_summary->>'highConfidence')::integer,0));
  v_medium:=greatest(0,coalesce((v_summary->>'mediumConfidence')::integer,0));
  v_low:=greatest(0,coalesce((v_summary->>'lowConfidence')::integer,0));
  v_none:=greatest(0,coalesce((v_summary->>'noCandidates')::integer,0));
  v_candidate_rate:=case when v_active>0 then least(1,greatest(0,v_with::numeric/v_active)) else 0 end;
  v_safe_rate:=case when v_with>0 then least(1,greatest(0,v_safe::numeric/v_with)) else 0 end;
  v_ambiguity_rate:=case when v_with>0 then least(1,greatest(0,v_ambiguous::numeric/v_with)) else 0 end;

  insert into financial_app.document_matching_quality_snapshots(
    snapshot_day,captured_at,engine_version,active_unlinked,with_candidates,safe_auto,ambiguous,
    high_confidence,medium_confidence,low_confidence,no_candidates,candidate_rate,safe_auto_rate,ambiguity_rate
  ) values(
    v_day,now(),financial_app.current_app_version(),v_active,v_with,v_safe,v_ambiguous,
    v_high,v_medium,v_low,v_none,v_candidate_rate,v_safe_rate,v_ambiguity_rate
  )
  on conflict(snapshot_day) do update set
    captured_at=excluded.captured_at,
    engine_version=excluded.engine_version,
    active_unlinked=excluded.active_unlinked,
    with_candidates=excluded.with_candidates,
    safe_auto=excluded.safe_auto,
    ambiguous=excluded.ambiguous,
    high_confidence=excluded.high_confidence,
    medium_confidence=excluded.medium_confidence,
    low_confidence=excluded.low_confidence,
    no_candidates=excluded.no_candidates,
    candidate_rate=excluded.candidate_rate,
    safe_auto_rate=excluded.safe_auto_rate,
    ambiguity_rate=excluded.ambiguity_rate
  where (
    financial_app.document_matching_quality_snapshots.engine_version,
    financial_app.document_matching_quality_snapshots.active_unlinked,
    financial_app.document_matching_quality_snapshots.with_candidates,
    financial_app.document_matching_quality_snapshots.safe_auto,
    financial_app.document_matching_quality_snapshots.ambiguous,
    financial_app.document_matching_quality_snapshots.high_confidence,
    financial_app.document_matching_quality_snapshots.medium_confidence,
    financial_app.document_matching_quality_snapshots.low_confidence,
    financial_app.document_matching_quality_snapshots.no_candidates,
    financial_app.document_matching_quality_snapshots.candidate_rate,
    financial_app.document_matching_quality_snapshots.safe_auto_rate,
    financial_app.document_matching_quality_snapshots.ambiguity_rate
  ) is distinct from (
    excluded.engine_version,excluded.active_unlinked,excluded.with_candidates,excluded.safe_auto,excluded.ambiguous,
    excluded.high_confidence,excluded.medium_confidence,excluded.low_confidence,excluded.no_candidates,
    excluded.candidate_rate,excluded.safe_auto_rate,excluded.ambiguity_rate
  );

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'snapshotDate',v_day,
    'storedNoFinancialValues',true,
    'observability',v_payload,
    'history',financial_app.document_matching_quality_history_core(p_days)
  );
end
$function$;

create or replace function public.financial_app_document_matching_dashboard(
  p_limit integer default 8,
  p_days integer default 90
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select financial_app.document_matching_dashboard_core(p_limit,p_days)
$function$;

revoke all on function financial_app.document_matching_quality_history_core(integer) from public,anon,authenticated;
revoke all on function financial_app.document_matching_dashboard_core(integer,integer) from public,anon,authenticated;
revoke all on function public.financial_app_document_matching_dashboard(integer,integer) from public,anon;
grant execute on function public.financial_app_document_matching_dashboard(integer,integer) to authenticated;

commit;
