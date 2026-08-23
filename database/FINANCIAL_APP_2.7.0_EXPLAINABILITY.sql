-- Financial App 2.7.0 · Explicabilidad y sugerencias de reglas
-- Solo lectura: no modifica movimientos, reglas ni la fuente bancaria.

create or replace function financial_app.explainability_overview_core(p_limit integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare
  v_email text:=financial_app.authorized_email();
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),50));
  v_origins jsonb:='{}'::jsonb;
  v_suggestions jsonb:='[]'::jsonb;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  with base as materialized (
    select t.*,
      exists(select 1 from financial_app.transaction_splits s where s.transaction_id=t.id) as has_split,
      exists(
        select 1 from financial_app.transaction_rule_applications a
        where a.transaction_id=t.id and a.reverted_at is null
          and (
            (a.changes ? 'category' and t.category_override is not distinct from a.changes#>>'{category,after}') or
            (a.changes ? 'subcategory' and t.subcategory_override is not distinct from a.changes#>>'{subcategory,after}')
          )
      ) as has_rule_classification,
      (
        (t.category_override is not null and not exists(
          select 1 from financial_app.transaction_rule_applications a
          where a.transaction_id=t.id and a.reverted_at is null and a.changes ? 'category'
            and t.category_override is not distinct from a.changes#>>'{category,after}'
        )) or
        (t.subcategory_override is not null and not exists(
          select 1 from financial_app.transaction_rule_applications a
          where a.transaction_id=t.id and a.reverted_at is null and a.changes ? 'subcategory'
            and t.subcategory_override is not distinct from a.changes#>>'{subcategory,after}'
        )) or
        t.counterparty_override is not null
      ) as has_manual_classification
    from financial_app.transactions t
    where t.source_missing=false
  ), origins as (
    select case
      when has_split then 'split'
      when has_manual_classification then 'manual'
      when has_rule_classification then 'rule'
      else 'source'
    end origin
    from base
  )
  select jsonb_build_object(
    'total',count(*),
    'source',count(*) filter(where origin='source'),
    'rule',count(*) filter(where origin='rule'),
    'manual',count(*) filter(where origin='manual'),
    'split',count(*) filter(where origin='split')
  ) into v_origins from origins;

  with eligible as materialized (
    select
      t.id,t.source_id,t.source_date,t.source_amount,t.source_counterparty,t.source_category,t.source_subcategory,
      lower(trim(t.source_counterparty)) merchant_key,
      case when t.source_amount>0 then 'income' else 'expense' end direction
    from financial_app.transactions t
    where t.source_missing=false
      and t.is_duplicate=false
      and t.is_internal_transfer=false
      and t.source_amount<>0
      and nullif(trim(coalesce(t.source_counterparty,'')),'') is not null
      and nullif(trim(coalesce(t.source_category,'')),'') is not null
      and not exists(select 1 from financial_app.transaction_splits s where s.transaction_id=t.id)
      and t.category_override is null
      and t.subcategory_override is null
      and t.counterparty_override is null
      and not exists(select 1 from financial_app.transaction_rule_applications a where a.transaction_id=t.id and a.reverted_at is null)
  ), totals as (
    select merchant_key,direction,count(*)::int total,
      (array_agg(source_counterparty order by source_date desc nulls last,source_id desc))[1] merchant
    from eligible group by merchant_key,direction
  ), classes as (
    select merchant_key,direction,source_category,coalesce(source_subcategory,'') source_subcategory,count(*)::int matches
    from eligible
    group by merchant_key,direction,source_category,coalesce(source_subcategory,'')
  ), ranked as (
    select c.*,row_number() over(partition by merchant_key,direction order by matches desc,source_category,source_subcategory) rn
    from classes c
  ), candidates as (
    select t.merchant_key,t.merchant,t.direction,t.total,r.matches,r.source_category,r.source_subcategory,
      round((r.matches::numeric/nullif(t.total,0)),3) confidence
    from totals t join ranked r using(merchant_key,direction)
    where r.rn=1 and t.total>=3 and r.matches::numeric/nullif(t.total,0)>=0.80
      and not exists(
        select 1 from financial_app.transaction_rules rule
        where rule.active=true and rule.counterparty_operator='equals'
          and lower(trim(coalesce(rule.match_counterparty,'')))=t.merchant_key
          and rule.direction in ('any',t.direction)
      )
    order by (r.matches::numeric/nullif(t.total,0)) desc,t.total desc,t.merchant
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',md5(c.merchant_key||':'||c.direction),
    'merchant',c.merchant,
    'direction',c.direction,
    'targetCategory',c.source_category,
    'targetSubcategory',nullif(c.source_subcategory,''),
    'matched',c.total,
    'dominantMatches',c.matches,
    'confidence',c.confidence,
    'samples',coalesce((
      select jsonb_agg(jsonb_build_object('sourceId',s.source_id,'date',s.source_date,'amount',s.source_amount) order by s.source_date desc,s.source_id desc)
      from (
        select e.source_id,e.source_date,e.source_amount
        from eligible e
        where e.merchant_key=c.merchant_key and e.direction=c.direction
        order by e.source_date desc nulls last,e.source_id desc
        limit 5
      ) s
    ),'[]'::jsonb)
  ) order by c.confidence desc,c.total desc,c.merchant),'[]'::jsonb)
  into v_suggestions from candidates c;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'provenance',v_origins,
    'precedence',jsonb_build_array(
      jsonb_build_object('key','split','label','División manual','priority',1,'detail','Las partes del movimiento mandan sobre la clasificación completa.'),
      jsonb_build_object('key','manual','label','Ajuste manual','priority',2,'detail','Una edición privada del usuario manda sobre cualquier regla.'),
      jsonb_build_object('key','rule','label','Regla automática','priority',3,'detail','Una regla privada actúa solo cuando no existe una edición manual protegida.'),
      jsonb_build_object('key','source','label','Fuente bancaria','priority',4,'detail','Se usa cuando no existe ninguna clasificación privada con mayor prioridad.')
    ),
    'suggestions',v_suggestions,
    'guardrails',jsonb_build_object(
      'readOnly',true,'sourceUntouched',true,'previewRequired',true,'minSamples',3,'minDominance',0.80,
      'manualOverridesExcluded',true,'splitsExcluded',true,'existingRuleApplicationsExcluded',true
    )
  );
end $$;

create or replace function public.financial_app_explainability_overview(p_limit integer default 20)
returns jsonb
language sql
stable
set search_path to 'pg_catalog','financial_app','auth'
as $$select financial_app.explainability_overview_core(p_limit)$$;

revoke all on function public.financial_app_explainability_overview(integer) from public,anon;
grant execute on function public.financial_app_explainability_overview(integer) to authenticated;
