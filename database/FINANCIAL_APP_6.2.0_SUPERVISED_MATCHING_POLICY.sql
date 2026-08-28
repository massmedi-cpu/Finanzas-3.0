begin;

-- Financial App 6.2.0 — política supervisada de matching.
-- Esta migración NO cambia el motor 6.1. Solo crea políticas, propuestas y RPCs nuevos.
-- Ningún umbral se autoajusta: aplicar/rechazar/rollback requieren una acción autenticada explícita.

create table if not exists financial_app.document_matching_policies(
  policy_id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by text not null,
  source text not null check(source in('default','proposal','rollback','manual')),
  min_score numeric(5,2) not null check(min_score between 80 and 100),
  min_margin numeric(5,2) not null check(min_margin between 4 and 25),
  require_merchant_match boolean not null default true,
  active boolean not null default false,
  supersedes_policy_id bigint null references financial_app.document_matching_policies(policy_id)
);

create unique index if not exists document_matching_policies_one_active
  on financial_app.document_matching_policies((active)) where active=true;

create table if not exists financial_app.document_matching_policy_proposals(
  proposal_id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  status text not null default 'pending' check(status in('pending','accepted','rejected','superseded')),
  window_days integer not null check(window_days between 7 and 365),
  sample_with_suggestions integer not null check(sample_with_suggestions>=0),
  auto_eligible_cases integer not null check(auto_eligible_cases>=0),
  auto_eligible_rejected integer not null check(auto_eligible_rejected>=0),
  top_choice_rate numeric(8,5) not null check(top_choice_rate between 0 and 1),
  auto_acceptance_rate numeric(8,5) not null check(auto_acceptance_rate between 0 and 1),
  current_score numeric(5,2) not null,
  current_margin numeric(5,2) not null,
  proposed_score numeric(5,2) not null,
  proposed_margin numeric(5,2) not null,
  require_merchant_match boolean not null,
  recommendation text not null check(recommendation in('tighten_score','tighten_margin','tighten_both')),
  evidence_note text not null
);

revoke all on table financial_app.document_matching_policies from public,anon,authenticated;
revoke all on table financial_app.document_matching_policy_proposals from public,anon,authenticated;

insert into financial_app.document_matching_policies(
  created_by,source,min_score,min_margin,require_merchant_match,active
)
select 'system:financial-app-6.2.0','default',93,8,true,true
where not exists(select 1 from financial_app.document_matching_policies where active=true);

create or replace function financial_app.document_matching_active_policy_core()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
  select coalesce((
    select jsonb_build_object(
      'policyId',p.policy_id,
      'createdAt',p.created_at,
      'source',p.source,
      'minScore',p.min_score,
      'minMargin',p.min_margin,
      'requireMerchantMatch',p.require_merchant_match
    )
    from financial_app.document_matching_policies p
    where p.active=true
    order by p.policy_id desc
    limit 1
  ),jsonb_build_object(
    'policyId',0,
    'createdAt',now(),
    'source','default',
    'minScore',93,
    'minMargin',8,
    'requireMerchantMatch',true
  ))
$function$;

create or replace function financial_app.document_matching_policy_recommendation_core(
  p_days integer default 90
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_days integer;
  v_policy jsonb;
  v_score numeric;
  v_margin numeric;
  v_with integer;
  v_top integer;
  v_auto integer;
  v_rejected integer;
  v_near integer;
  v_far integer;
  v_top_rate numeric;
  v_auto_rate numeric;
  v_kind text;
  v_proposed_score numeric;
  v_proposed_margin numeric;
  v_note text;
begin
  v_days:=greatest(7,least(coalesce(p_days,90),365));
  v_policy:=financial_app.document_matching_active_policy_core();
  v_score:=coalesce((v_policy->>'minScore')::numeric,93);
  v_margin:=coalesce((v_policy->>'minMargin')::numeric,8);

  select
    count(*) filter(where decision='accepted' and had_suggestions)::int,
    count(*) filter(where decision='accepted' and had_suggestions and chosen_was_top)::int,
    count(*) filter(where decision='accepted' and top_auto_eligible)::int,
    count(*) filter(where decision='accepted' and top_auto_eligible and not coalesce(chosen_was_top,false))::int,
    count(*) filter(where decision='accepted' and top_auto_eligible and not coalesce(chosen_was_top,false) and top_margin_band='8-14')::int,
    count(*) filter(where decision='accepted' and top_auto_eligible and not coalesce(chosen_was_top,false) and top_margin_band='15plus')::int
  into v_with,v_top,v_auto,v_rejected,v_near,v_far
  from financial_app.document_matching_calibration_events
  where event_day >= ((now() at time zone 'Europe/Madrid')::date-(v_days-1));

  v_with:=coalesce(v_with,0);v_top:=coalesce(v_top,0);v_auto:=coalesce(v_auto,0);v_rejected:=coalesce(v_rejected,0);
  v_near:=coalesce(v_near,0);v_far:=coalesce(v_far,0);
  v_top_rate:=case when v_with>0 then round(v_top::numeric/v_with,5) else 0 end;
  v_auto_rate:=case when v_auto>0 then round((v_auto-v_rejected)::numeric/v_auto,5) else 0 end;
  v_proposed_score:=v_score;v_proposed_margin:=v_margin;

  if v_with<20 or v_auto<5 then
    v_kind:='insufficient_evidence';
    v_note:=format('Necesita al menos 20 decisiones con sugerencias y 5 casos autoelegibles. Ahora: %s y %s.',v_with,v_auto);
  elsif v_rejected=0 and v_top_rate>=0.98 then
    v_kind:='keep';
    v_note:='La evidencia disponible no justifica endurecer la política actual.';
  elsif v_near>v_far then
    v_kind:='tighten_margin';
    v_proposed_margin:=least(25,v_margin+2);
    v_note:='Los rechazos autoelegibles se concentran en márgenes cercanos; conviene exigir más separación entre candidatos.';
  elsif v_far>v_near then
    v_kind:='tighten_score';
    v_proposed_score:=least(99,v_score+2);
    v_note:='Hay rechazos incluso con candidatos bien separados; conviene exigir una puntuación superior.';
  else
    v_kind:='tighten_both';
    v_proposed_score:=least(99,v_score+1);
    v_proposed_margin:=least(25,v_margin+2);
    v_note:='La evidencia de rechazo no se concentra en una sola causa; se propone un endurecimiento conservador conjunto.';
  end if;

  return jsonb_build_object(
    'windowDays',v_days,
    'sampleWithSuggestions',v_with,
    'topChosen',v_top,
    'autoEligibleCases',v_auto,
    'autoEligibleRejected',v_rejected,
    'topChoiceRate',v_top_rate,
    'autoAcceptanceRate',v_auto_rate,
    'recommendation',v_kind,
    'currentScore',v_score,
    'currentMargin',v_margin,
    'proposedScore',v_proposed_score,
    'proposedMargin',v_proposed_margin,
    'requireMerchantMatch',true,
    'evidenceNote',v_note,
    'minimumSuggestedDecisions',20,
    'minimumAutoEligibleCases',5,
    'neverRelaxesAutomatically',true,
    'requiresExplicitApproval',true
  );
end
$function$;

create or replace function financial_app.document_matching_policy_dashboard_core(
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
  v_policy jsonb;
  v_recommendation jsonb;
  v_pending jsonb;
  v_history jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_policy:=financial_app.document_matching_active_policy_core();
  v_recommendation:=financial_app.document_matching_policy_recommendation_core(p_days);

  select coalesce((select jsonb_build_object(
    'proposalId',p.proposal_id,'createdAt',p.created_at,'status',p.status,
    'proposedScore',p.proposed_score,'proposedMargin',p.proposed_margin,
    'recommendation',p.recommendation,'evidenceNote',p.evidence_note,
    'sampleWithSuggestions',p.sample_with_suggestions,'autoEligibleCases',p.auto_eligible_cases,
    'autoEligibleRejected',p.auto_eligible_rejected,'topChoiceRate',p.top_choice_rate,
    'autoAcceptanceRate',p.auto_acceptance_rate
  ) from financial_app.document_matching_policy_proposals p
    where p.status='pending' order by p.proposal_id desc limit 1),null::jsonb)
  into v_pending;

  select coalesce(jsonb_agg(jsonb_build_object(
    'policyId',p.policy_id,'createdAt',p.created_at,'source',p.source,
    'minScore',p.min_score,'minMargin',p.min_margin,'requireMerchantMatch',p.require_merchant_match,
    'active',p.active
  ) order by p.policy_id desc),'[]'::jsonb)
  into v_history
  from (select * from financial_app.document_matching_policies order by policy_id desc limit 8) p;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'activePolicy',v_policy,
    'recommendation',v_recommendation,
    'pendingProposal',v_pending,
    'policyHistory',v_history,
    'rules',jsonb_build_object(
      'manualApprovalRequired',true,
      'rollbackAvailable',true,
      'neverAutoApply',true,
      'neverAutoRelax',true
    )
  );
end
$function$;

create or replace function financial_app.document_matching_policy_generate_core(
  p_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_rec jsonb;
  v_kind text;
  v_id bigint;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_rec:=financial_app.document_matching_policy_recommendation_core(p_days);
  v_kind:=coalesce(v_rec->>'recommendation','insufficient_evidence');

  if v_kind not in('tighten_score','tighten_margin','tighten_both') then
    return jsonb_build_object('created',false,'reason',v_kind,'dashboard',financial_app.document_matching_policy_dashboard_core(p_days));
  end if;

  select p.proposal_id into v_id
  from financial_app.document_matching_policy_proposals p
  where p.status='pending'
    and p.proposed_score=(v_rec->>'proposedScore')::numeric
    and p.proposed_margin=(v_rec->>'proposedMargin')::numeric
    and p.require_merchant_match=true
  order by p.proposal_id desc limit 1;

  if v_id is null then
    update financial_app.document_matching_policy_proposals
      set status='superseded',resolved_at=now(),resolved_by=v_email
    where status='pending';

    insert into financial_app.document_matching_policy_proposals(
      window_days,sample_with_suggestions,auto_eligible_cases,auto_eligible_rejected,
      top_choice_rate,auto_acceptance_rate,current_score,current_margin,proposed_score,proposed_margin,
      require_merchant_match,recommendation,evidence_note
    ) values(
      (v_rec->>'windowDays')::integer,(v_rec->>'sampleWithSuggestions')::integer,
      (v_rec->>'autoEligibleCases')::integer,(v_rec->>'autoEligibleRejected')::integer,
      (v_rec->>'topChoiceRate')::numeric,(v_rec->>'autoAcceptanceRate')::numeric,
      (v_rec->>'currentScore')::numeric,(v_rec->>'currentMargin')::numeric,
      (v_rec->>'proposedScore')::numeric,(v_rec->>'proposedMargin')::numeric,true,
      v_kind,v_rec->>'evidenceNote'
    ) returning proposal_id into v_id;
  end if;

  return jsonb_build_object('created',true,'proposalId',v_id,'dashboard',financial_app.document_matching_policy_dashboard_core(p_days));
end
$function$;

create or replace function financial_app.document_matching_policy_apply_core(
  p_proposal_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_current bigint;
  v_new bigint;
  v_proposal financial_app.document_matching_policy_proposals%rowtype;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_proposal from financial_app.document_matching_policy_proposals where proposal_id=p_proposal_id for update;
  if not found or v_proposal.status<>'pending' then raise exception 'policy_proposal_not_pending'; end if;
  select policy_id into v_current from financial_app.document_matching_policies where active=true order by policy_id desc limit 1 for update;

  update financial_app.document_matching_policies set active=false where active=true;
  insert into financial_app.document_matching_policies(
    created_by,source,min_score,min_margin,require_merchant_match,active,supersedes_policy_id
  ) values(
    v_email,'proposal',v_proposal.proposed_score,v_proposal.proposed_margin,true,true,v_current
  ) returning policy_id into v_new;

  update financial_app.document_matching_policy_proposals
    set status='accepted',resolved_at=now(),resolved_by=v_email
  where proposal_id=p_proposal_id;

  return jsonb_build_object('ok',true,'policyId',v_new,'dashboard',financial_app.document_matching_policy_dashboard_core(v_proposal.window_days));
end
$function$;

create or replace function financial_app.document_matching_policy_reject_core(
  p_proposal_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare v_email text;v_days integer;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  update financial_app.document_matching_policy_proposals
    set status='rejected',resolved_at=now(),resolved_by=v_email
  where proposal_id=p_proposal_id and status='pending'
  returning window_days into v_days;
  if v_days is null then raise exception 'policy_proposal_not_pending'; end if;
  return jsonb_build_object('ok',true,'dashboard',financial_app.document_matching_policy_dashboard_core(v_days));
end
$function$;

create or replace function financial_app.document_matching_policy_rollback_core()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare
  v_email text;
  v_current financial_app.document_matching_policies%rowtype;
  v_previous financial_app.document_matching_policies%rowtype;
  v_new bigint;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_current from financial_app.document_matching_policies where active=true order by policy_id desc limit 1 for update;
  if not found then raise exception 'active_policy_missing'; end if;
  select * into v_previous from financial_app.document_matching_policies
  where policy_id<>v_current.policy_id and policy_id<v_current.policy_id
  order by policy_id desc limit 1;
  if not found then raise exception 'previous_policy_missing'; end if;

  update financial_app.document_matching_policies set active=false where active=true;
  insert into financial_app.document_matching_policies(
    created_by,source,min_score,min_margin,require_merchant_match,active,supersedes_policy_id
  ) values(
    v_email,'rollback',v_previous.min_score,v_previous.min_margin,v_previous.require_merchant_match,true,v_current.policy_id
  ) returning policy_id into v_new;

  return jsonb_build_object('ok',true,'policyId',v_new,'dashboard',financial_app.document_matching_policy_dashboard_core(90));
end
$function$;

create or replace function public.financial_app_document_matching_policy_dashboard(p_days integer default 90)
returns jsonb language sql stable set search_path to 'pg_catalog','financial_app','auth'
as $function$select financial_app.document_matching_policy_dashboard_core(p_days)$function$;

create or replace function public.financial_app_document_matching_policy_generate(p_days integer default 90)
returns jsonb language sql set search_path to 'pg_catalog','financial_app','auth'
as $function$select financial_app.document_matching_policy_generate_core(p_days)$function$;

create or replace function public.financial_app_document_matching_policy_apply(p_proposal_id bigint)
returns jsonb language sql set search_path to 'pg_catalog','financial_app','auth'
as $function$select financial_app.document_matching_policy_apply_core(p_proposal_id)$function$;

create or replace function public.financial_app_document_matching_policy_reject(p_proposal_id bigint)
returns jsonb language sql set search_path to 'pg_catalog','financial_app','auth'
as $function$select financial_app.document_matching_policy_reject_core(p_proposal_id)$function$;

create or replace function public.financial_app_document_matching_policy_rollback()
returns jsonb language sql set search_path to 'pg_catalog','financial_app','auth'
as $function$select financial_app.document_matching_policy_rollback_core()$function$;

revoke all on function financial_app.document_matching_active_policy_core() from public,anon,authenticated;
revoke all on function financial_app.document_matching_policy_recommendation_core(integer) from public,anon,authenticated;
revoke all on function financial_app.document_matching_policy_dashboard_core(integer) from public,anon,authenticated;
revoke all on function financial_app.document_matching_policy_generate_core(integer) from public,anon,authenticated;
revoke all on function financial_app.document_matching_policy_apply_core(bigint) from public,anon,authenticated;
revoke all on function financial_app.document_matching_policy_reject_core(bigint) from public,anon,authenticated;
revoke all on function financial_app.document_matching_policy_rollback_core() from public,anon,authenticated;

revoke all on function public.financial_app_document_matching_policy_dashboard(integer) from public,anon;
revoke all on function public.financial_app_document_matching_policy_generate(integer) from public,anon;
revoke all on function public.financial_app_document_matching_policy_apply(bigint) from public,anon;
revoke all on function public.financial_app_document_matching_policy_reject(bigint) from public,anon;
revoke all on function public.financial_app_document_matching_policy_rollback() from public,anon;

grant execute on function public.financial_app_document_matching_policy_dashboard(integer) to authenticated;
grant execute on function public.financial_app_document_matching_policy_generate(integer) to authenticated;
grant execute on function public.financial_app_document_matching_policy_apply(bigint) to authenticated;
grant execute on function public.financial_app_document_matching_policy_reject(bigint) to authenticated;
grant execute on function public.financial_app_document_matching_policy_rollback() to authenticated;

commit;
