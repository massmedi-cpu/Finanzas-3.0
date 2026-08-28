begin;

-- Financial App 6.1.0 — calibración anónima por decisiones reales.
-- No almacena IDs de documentos/movimientos, importes, comercios, conceptos, contrapartes ni source_id.
-- Los RPC existentes de 6.0.1 no se sustituyen: 6.1 opta explícitamente por wrappers calibrados nuevos.

create table if not exists financial_app.document_matching_calibration_events(
  id bigint generated always as identity primary key,
  event_at timestamptz not null default now(),
  event_day date not null default ((now() at time zone 'Europe/Madrid')::date),
  engine_version text not null,
  decision text not null check(decision in('accepted','reverted')),
  association_origin text not null,
  had_suggestions boolean,
  chosen_was_suggested boolean,
  chosen_was_top boolean,
  chosen_rank smallint check(chosen_rank is null or chosen_rank between 1 and 20),
  candidate_count smallint check(candidate_count is null or candidate_count between 1 and 32767),
  top_score_band text check(top_score_band is null or top_score_band in('lt60','60-74','75-92','93-99','100')),
  top_confidence_tier text check(top_confidence_tier is null or top_confidence_tier in('low','medium','high','exact')),
  top_margin_band text check(top_margin_band is null or top_margin_band in('single','lt4','4-7','8-14','15plus','unknown')),
  top_merchant_match boolean,
  top_auto_eligible boolean
);

create index if not exists document_matching_calibration_events_day_idx
  on financial_app.document_matching_calibration_events(event_day desc);

revoke all on table financial_app.document_matching_calibration_events from public,anon,authenticated;

create or replace function financial_app.archive_link_calibrated_core(
  p_document_id uuid,
  p_source_id text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_existing_origin text;
  v_linked boolean;
  v_top_score numeric;
  v_top_confidence text;
  v_top_margin numeric;
  v_top_merchant boolean;
  v_top_auto boolean;
  v_candidate_count integer;
  v_chosen_rank integer;
  v_score_band text;
  v_margin_band text;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select td.association_origin into v_existing_origin
  from financial_app.transaction_documents td
  join financial_app.transactions t on t.id=td.transaction_id
  where td.document_id=p_document_id and t.source_id=p_source_id
  limit 1;

  with candidates as (
    select * from financial_app.document_match_candidates_rows_core(p_document_id,20)
  )
  select
    max(c.score) filter(where c.candidate_rank=1),
    max(c.confidence_tier) filter(where c.candidate_rank=1),
    max(c.score_margin) filter(where c.candidate_rank=1),
    bool_or(c.merchant_match) filter(where c.candidate_rank=1),
    bool_or(c.auto_eligible) filter(where c.candidate_rank=1),
    max(c.candidate_count) filter(where c.candidate_rank=1),
    max(c.candidate_rank) filter(where c.source_id=p_source_id)
  into v_top_score,v_top_confidence,v_top_margin,v_top_merchant,v_top_auto,v_candidate_count,v_chosen_rank
  from candidates c;

  v_linked:=financial_app.archive_link_core(p_document_id,p_source_id);

  if v_linked and v_existing_origin is distinct from 'manual' then
    v_score_band:=case
      when v_top_score is null then null
      when v_top_score>=100 then '100'
      when v_top_score>=93 then '93-99'
      when v_top_score>=75 then '75-92'
      when v_top_score>=60 then '60-74'
      else 'lt60'
    end;
    v_margin_band:=case
      when v_candidate_count is null then null
      when v_candidate_count<=1 then 'single'
      when v_top_margin is null then 'unknown'
      when v_top_margin<4 then 'lt4'
      when v_top_margin<8 then '4-7'
      when v_top_margin<15 then '8-14'
      else '15plus'
    end;

    insert into financial_app.document_matching_calibration_events(
      engine_version,decision,association_origin,had_suggestions,chosen_was_suggested,chosen_was_top,
      chosen_rank,candidate_count,top_score_band,top_confidence_tier,top_margin_band,top_merchant_match,top_auto_eligible
    ) values(
      financial_app.current_app_version(),'accepted','manual',coalesce(v_candidate_count,0)>0,v_chosen_rank is not null,v_chosen_rank=1,
      v_chosen_rank,v_candidate_count,v_score_band,v_top_confidence,v_margin_band,v_top_merchant,v_top_auto
    );
  end if;

  return v_linked;
end
$function$;

create or replace function financial_app.archive_unlink_calibrated_core(
  p_document_id uuid,
  p_source_id text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_origin text;
  v_unlinked boolean;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select td.association_origin into v_origin
  from financial_app.transaction_documents td
  join financial_app.transactions t on t.id=td.transaction_id
  where td.document_id=p_document_id and t.source_id=p_source_id
  limit 1;

  v_unlinked:=financial_app.archive_unlink_core(p_document_id,p_source_id);

  if v_unlinked and v_origin is not null then
    insert into financial_app.document_matching_calibration_events(
      engine_version,decision,association_origin
    ) values(financial_app.current_app_version(),'reverted',v_origin);
  end if;

  return v_unlinked;
end
$function$;

create or replace function financial_app.document_matching_calibration_core(
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

  with windowed as (
    select * from financial_app.document_matching_calibration_events
    where event_day >= ((now() at time zone 'Europe/Madrid')::date-(v_days-1))
  ), accepted as (
    select * from windowed where decision='accepted'
  ), summary as (
    select
      (select count(*) from accepted)::int accepted,
      (select count(*) from windowed where decision='reverted')::int reverted,
      (select count(*) from accepted where had_suggestions)::int with_suggestions,
      (select count(*) from accepted where chosen_was_top)::int top_chosen,
      (select count(*) from accepted where chosen_was_suggested and not chosen_was_top)::int alternative_chosen,
      (select count(*) from accepted where not coalesce(chosen_was_suggested,false))::int outside_suggestions,
      (select count(*) from accepted where top_auto_eligible)::int auto_eligible_cases,
      (select count(*) from accepted where top_auto_eligible and not coalesce(chosen_was_top,false))::int auto_eligible_rejected
  ), bands as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'band',x.top_score_band,
      'decisions',x.decisions,
      'topChosen',x.top_chosen,
      'topChoiceRate',case when x.decisions>0 then round(x.top_chosen::numeric/x.decisions,4) else 0 end
    ) order by case x.top_score_band when '100' then 5 when '93-99' then 4 when '75-92' then 3 when '60-74' then 2 else 1 end desc),'[]'::jsonb) value
    from (
      select top_score_band,count(*)::int decisions,count(*) filter(where chosen_was_top)::int top_chosen
      from accepted where top_score_band is not null
      group by top_score_band
    ) x
  ), reversals as (
    select coalesce(jsonb_agg(jsonb_build_object('origin',x.association_origin,'count',x.count) order by x.count desc),'[]'::jsonb) value
    from (
      select association_origin,count(*)::int count
      from windowed where decision='reverted'
      group by association_origin
    ) x
  )
  select jsonb_build_object(
    'version',financial_app.current_app_version(),
    'windowDays',v_days,
    'summary',jsonb_build_object(
      'accepted',s.accepted,
      'reverted',s.reverted,
      'withSuggestions',s.with_suggestions,
      'topChosen',s.top_chosen,
      'alternativeChosen',s.alternative_chosen,
      'outsideSuggestions',s.outside_suggestions,
      'autoEligibleCases',s.auto_eligible_cases,
      'autoEligibleRejected',s.auto_eligible_rejected,
      'suggestionCoverageRate',case when s.accepted>0 then round(s.with_suggestions::numeric/s.accepted,4) else 0 end,
      'topChoiceRate',case when s.with_suggestions>0 then round(s.top_chosen::numeric/s.with_suggestions,4) else 0 end,
      'autoEligibleAcceptanceRate',case when s.auto_eligible_cases>0 then round((s.auto_eligible_cases-s.auto_eligible_rejected)::numeric/s.auto_eligible_cases,4) else 0 end
    ),
    'scoreBands',b.value,
    'reversalsByOrigin',r.value,
    'rules',jsonb_build_object(
      'noFinancialValuesStored',true,
      'noEntityIdsStored',true,
      'thresholdsAreObservedNotAutoAdjusted',true
    )
  ) into v_result
  from summary s cross join bands b cross join reversals r;

  return v_result;
end
$function$;

create or replace function public.financial_app_archive_link_calibrated(p_document_id uuid,p_source_id text)
returns boolean
language sql
set search_path to 'pg_catalog','financial_app','auth'
as $function$select financial_app.archive_link_calibrated_core(p_document_id,p_source_id)$function$;

create or replace function public.financial_app_archive_unlink_calibrated(p_document_id uuid,p_source_id text)
returns boolean
language sql
set search_path to 'pg_catalog','financial_app','auth'
as $function$select financial_app.archive_unlink_calibrated_core(p_document_id,p_source_id)$function$;

create or replace function public.financial_app_document_matching_calibration(p_days integer default 90)
returns jsonb
language sql
stable
set search_path to 'pg_catalog','financial_app','auth'
as $function$select financial_app.document_matching_calibration_core(p_days)$function$;

revoke all on function financial_app.archive_link_calibrated_core(uuid,text) from public,anon,authenticated;
revoke all on function financial_app.archive_unlink_calibrated_core(uuid,text) from public,anon,authenticated;
revoke all on function financial_app.document_matching_calibration_core(integer) from public,anon,authenticated;
revoke all on function public.financial_app_archive_link_calibrated(uuid,text) from public,anon;
revoke all on function public.financial_app_archive_unlink_calibrated(uuid,text) from public,anon;
revoke all on function public.financial_app_document_matching_calibration(integer) from public,anon;
grant execute on function public.financial_app_archive_link_calibrated(uuid,text) to authenticated;
grant execute on function public.financial_app_archive_unlink_calibrated(uuid,text) to authenticated;
grant execute on function public.financial_app_document_matching_calibration(integer) to authenticated;

commit;
