-- Financial App 9.0.0 — cierre de rendimiento de identidad de obligaciones.
--
-- Objetivo: acelerar memoria anual, enriquecimiento de evidencia y rematching
-- sin duplicar lógica ni persistir referencias bancarias en claro. La clave
-- indexada reutiliza la huella canónica (hash) ya definida por el motor.

begin;

do $gate$
begin
  if to_regprocedure('financial_app.forecast_obligation_fingerprint(text,text)') is null then
    raise exception 'forecast_obligation_identity_dependency_missing';
  end if;
end
$gate$;

create index if not exists transactions_forecast_obligation_identity_idx
on financial_app.transactions using btree (
  account_id,
  financial_app.forecast_obligation_fingerprint(
    coalesce(source_original_concept,''),
    coalesce(
      nullif(counterparty_override,''),
      nullif(source_counterparty,''),
      nullif(normalized_concept_override,''),
      nullif(source_normalized_concept,''),
      nullif(source_original_concept,'')
    )
  ),
  (coalesce(effective_date,source_date))
)
where source_missing=false
  and is_duplicate=false
  and is_internal_transfer=false;

do $verify$
declare
  v_definition text;
  v_valid boolean:=false;
  v_ready boolean:=false;
begin
  select pg_get_indexdef(c.oid),i.indisvalid,i.indisready
  into v_definition,v_valid,v_ready
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  join pg_index i on i.indexrelid=c.oid
  where n.nspname='financial_app'
    and c.relname='transactions_forecast_obligation_identity_idx'
    and i.indrelid='financial_app.transactions'::regclass;

  if coalesce(v_definition,'')=''
     or not coalesce(v_valid,false)
     or not coalesce(v_ready,false)
     or v_definition not like '%account_id%'
     or v_definition not like '%forecast_obligation_fingerprint%'
     or v_definition not like '%COALESCE(effective_date, source_date)%'
     or v_definition not like '%source_missing = false%'
     or v_definition not like '%is_duplicate = false%'
     or v_definition not like '%is_internal_transfer = false%'
  then
    raise exception 'forecast_obligation_performance_index_invalid';
  end if;
end
$verify$;

-- Actualiza estadísticas después de crear el nuevo camino de acceso.
analyze financial_app.transactions;

commit;
