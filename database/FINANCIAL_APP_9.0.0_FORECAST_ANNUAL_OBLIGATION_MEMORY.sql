begin;

-- Financial App 9.0.0 — memoria estacional de obligaciones anuales.
-- Recupera seguros/impuestos tras un año ausente sin crear un segundo motor:
-- forecast_calendar_visible_core sigue siendo la capa canónica de conciliación 1↔1,
-- descartes y proyección mensual. Esta migración solo mejora cómo se forman sus
-- candidatos de historial anual.

create or replace function financial_app.forecast_annual_memory_candidate(
  p_transaction_id uuid,
  p_start date,
  p_end date
)
returns table(
  target_date date,
  estimated_amount numeric,
  observations integer,
  years_observed integer,
  missed_years integer,
  confidence numeric
)
language plpgsql
stable
set search_path=pg_catalog,financial_app
as $$
declare
  v_account_id uuid;
  v_anchor_date date;
  v_anchor_amount numeric;
  v_category text;
  v_subcategory text;
  v_title text;
  v_key_norm text;
  v_latest_date date;
  v_median_amount numeric;
  v_observations integer:=0;
  v_years_observed integer:=0;
  v_age_days integer:=0;
  v_strong_signal boolean:=false;
  v_target date;
  v_year integer;
  v_month integer;
  v_day integer;
  v_last_day integer;
begin
  if p_transaction_id is null or p_start is null or p_end is null or p_end<p_start then return; end if;

  select t.account_id,
    coalesce(t.effective_date,t.source_date)::date,
    coalesce(t.personal_amount_override,t.source_amount)::numeric,
    coalesce(t.category_override,t.source_category),
    coalesce(t.subcategory_override,t.source_subcategory),
    coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')),
    financial_app.forecast_norm(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')))
  into v_account_id,v_anchor_date,v_anchor_amount,v_category,v_subcategory,v_title,v_key_norm
  from financial_app.transactions t
  join financial_app.accounts a on a.id=t.account_id
  where t.id=p_transaction_id
    and a.account_role='operating'
    and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
    and coalesce(t.personal_amount_override,t.source_amount)<=-5
    and coalesce(t.effective_date,t.source_date)<=current_date
    and financial_app.forecast_is_annual_signal(
      coalesce(t.category_override,t.source_category),
      coalesce(t.subcategory_override,t.source_subcategory),
      coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
    );

  if not found or coalesce(v_key_norm,'')='' then return; end if;

  -- Una única señal se admite solo cuando el propio texto/categoría es inequívoco.
  -- Los pagos municipales/genéricos necesitan repetición histórica para no convertir
  -- una compra aislada en una obligación anual.
  v_strong_signal:=
    lower(coalesce(v_category,'')||' '||coalesce(v_subcategory,'')) ~ '(seguros|seguro)'
    or lower(coalesce(v_title,'')) ~ '(seguro|línea directa|linea directa|domiciliacion impuesto|domiciliación impuesto|impuesto|irpf|\mibi\M|\mivtm\M|tributo|tasa municipal)';

  with memory_rows as(
    select coalesce(t.effective_date,t.source_date)::date d,
      coalesce(t.personal_amount_override,t.source_amount)::numeric amount
    from financial_app.transactions t
    join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating'
      and t.account_id=v_account_id
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.personal_amount_override,t.source_amount)<=-5
      and coalesce(t.effective_date,t.source_date) between p_start-2190 and current_date
      and financial_app.forecast_norm(coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,'')))=v_key_norm
      and financial_app.forecast_is_annual_signal(
        coalesce(t.category_override,t.source_category),
        coalesce(t.subcategory_override,t.source_subcategory),
        coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''))
      )
      and least(
        abs(extract(doy from coalesce(t.effective_date,t.source_date))-extract(doy from v_anchor_date)),
        366-abs(extract(doy from coalesce(t.effective_date,t.source_date))-extract(doy from v_anchor_date))
      )<=35
      and abs(abs(coalesce(t.personal_amount_override,t.source_amount))-abs(v_anchor_amount))
        <=greatest(2::numeric,greatest(abs(coalesce(t.personal_amount_override,t.source_amount)),abs(v_anchor_amount))*.12)
  )
  select count(*)::int,
    count(distinct extract(year from d))::int,
    max(d),
    percentile_cont(.5) within group(order by amount)::numeric
  into v_observations,v_years_observed,v_latest_date,v_median_amount
  from memory_rows;

  -- Solo la fecha más reciente de cada huella estacional actúa como ancla. Si hay
  -- varias obligaciones indistinguibles el mismo día/importe, se conserva su
  -- multiplicidad porque comparten fecha máxima pero siguen siendo transacciones distintas.
  if v_latest_date is null or v_anchor_date<v_latest_date then return; end if;
  if v_years_observed<2 and not v_strong_signal then return; end if;

  v_age_days:=greatest(0,p_start-v_anchor_date);
  if v_age_days<=550 then
    null;
  elsif v_age_days<=950 then
    if v_years_observed<2 then return; end if;
  elsif v_age_days<=1300 then
    if v_years_observed<3 then return; end if;
  else
    return;
  end if;

  -- Próximo aniversario dentro del horizonte, no simplemente fecha histórica + 1 año.
  -- Esto permite sobrevivir a un ejercicio ausente sin prolongar la señal indefinidamente.
  v_year:=extract(year from p_start)::int;
  v_month:=extract(month from v_anchor_date)::int;
  v_day:=extract(day from v_anchor_date)::int;
  v_last_day:=extract(day from (date_trunc('month',make_date(v_year,v_month,1))+interval '1 month - 1 day')::date)::int;
  v_target:=make_date(v_year,v_month,least(v_day,v_last_day));
  if v_target<p_start then
    v_year:=v_year+1;
    v_last_day:=extract(day from (date_trunc('month',make_date(v_year,v_month,1))+interval '1 month - 1 day')::date)::int;
    v_target:=make_date(v_year,v_month,least(v_day,v_last_day));
  end if;
  if v_target>p_end then return; end if;

  missed_years:=greatest(0,floor(v_age_days/365.25)::int-1);
  observations:=v_observations;
  years_observed:=v_years_observed;
  estimated_amount:=round(coalesce(v_median_amount,v_anchor_amount),2);
  confidence:=greatest(.52::numeric,least(.88::numeric,
    (case
      when v_years_observed>=4 then .86
      when v_years_observed=3 then .82
      when v_years_observed=2 then .76
      else .68
    end)::numeric-(missed_years*.08)::numeric
  ));
  target_date:=v_target;
  return next;
end
$$;

revoke all on function financial_app.forecast_annual_memory_candidate(uuid,date,date) from public,anon,authenticated,service_role;

-- Parche guardado sobre la implementación canónica vigente: conserva toda la
-- conciliación, descartes, facturas pendientes y cálculo de liquidez existentes,
-- sustituyendo únicamente la regla frágil "histórico + 1 año" por la memoria anterior.
do $migration$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef('financial_app.forecast_calendar_visible_core(date,integer)'::regprocedure) into v_def;
  if v_def is null then raise exception 'forecast_annual_memory_missing_visible_core'; end if;

  v_next:=replace(v_def,$old$
    select h.*,(h.d+interval '1 year')::date target_date
    from historic h
    where (h.d+interval '1 year')::date between v_start and v_end
$old$,$new$
    select h.*,m.target_date,m.estimated_amount,m.observations,m.years_observed,m.missed_years,m.confidence
    from historic h
    cross join lateral financial_app.forecast_annual_memory_candidate(h.transaction_id,v_start,v_end) m
    where m.target_date between v_start and v_end
$new$);
  if v_next=v_def then raise exception 'forecast_annual_memory_target_patch_not_applied'; end if;
  v_def:=v_next;

  if regexp_count(v_def,'h\.amount')<>4 then
    raise exception 'forecast_annual_memory_unexpected_amount_contract';
  end if;
  v_def:=replace(v_def,'h.amount','h.estimated_amount');

  v_next:=replace(v_def,$old$      'confidence',.72,$old$,$new$      'confidence',h.confidence,$new$);
  if v_next=v_def then raise exception 'forecast_annual_memory_confidence_patch_not_applied'; end if;
  v_def:=v_next;

  v_next:=replace(v_def,
    $old$      'explanation',jsonb_build_object('source','annual_tax_insurance_history','reason','Seguro o impuesto detectado por historial anual','observations',1),$old$,
    $new$      'explanation',jsonb_build_object(
        'source','annual_tax_insurance_history',
        'reason',case when h.missed_years>0 then 'Obligación anual recuperada tras un hueco en el historial' else 'Seguro o impuesto detectado por historial anual' end,
        'observations',h.observations,
        'yearsObserved',h.years_observed,
        'lastSeenDate',h.d,
        'missedYears',h.missed_years,
        'memoryRecovered',h.missed_years>0
      ),$new$);
  if v_next=v_def then raise exception 'forecast_annual_memory_explanation_patch_not_applied'; end if;
  v_def:=v_next;

  v_next:=replace(v_def,
    $old$      'genericTaxNeedsRepeatedIdentity',true$old$,
    $new$      'genericTaxNeedsRepeatedIdentity',true,
      'annualObligationMemory',true,
      'annualMemoryEvidenceDays',2190,
      'annualMemoryMaxAnchorAgeDays',1300,
      'annualMemoryAmountFingerprint',true,
      'annualMemoryConfidenceDecay',true$new$);
  if v_next=v_def then raise exception 'forecast_annual_memory_rules_patch_not_applied'; end if;
  v_def:=v_next;

  execute v_def;
end
$migration$;

comment on function financial_app.forecast_annual_memory_candidate(uuid,date,date) is
  'Internal annual obligation memory: seasonal date + amount fingerprint, repeated-evidence gates and confidence decay. Not exposed as RPC.';

commit;
