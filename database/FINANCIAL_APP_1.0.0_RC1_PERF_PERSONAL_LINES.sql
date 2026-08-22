-- Financial App 1.0.0-rc.1
-- Rendimiento: elimina la materialización ancha de transactions y los temporales
-- de personal_financial_lines(), conservando exactamente las mismas filas.

create or replace function financial_app.personal_financial_lines()
returns table(
  transaction_id uuid,
  movement_date date,
  amount numeric,
  category text,
  subcategory text,
  merchant text,
  movement_type text,
  account_id uuid,
  account_role text,
  cash_flow_enabled boolean,
  source_missing boolean,
  is_duplicate boolean,
  is_internal_transfer boolean,
  cash_flow_override boolean,
  needs_review boolean,
  status financial_app.transaction_status
)
language sql
stable security definer
set search_path to 'pg_catalog','financial_app'
as $function$
  select
    t.id,
    coalesce(t.effective_date,t.source_date),
    s.amount,
    coalesce(nullif(s.category,''),coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría')),
    coalesce(nullif(s.subcategory,''),coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),'')),
    coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin contraparte'),
    coalesce(nullif(t.type_override,''),nullif(t.source_transaction_type,''),'Sin tipo'),
    t.account_id,a.account_role,a.cash_flow_enabled,
    t.source_missing,t.is_duplicate,t.is_internal_transfer,t.cash_flow_override,t.needs_review,t.status
  from financial_app.transactions t
  join financial_app.accounts a on a.id=t.account_id
  join financial_app.transaction_splits s on s.transaction_id=t.id and s.is_personal=true

  union all

  select
    t.id,
    coalesce(t.effective_date,t.source_date),
    coalesce(t.personal_amount_override,t.source_amount),
    coalesce(nullif(t.category_override,''),nullif(t.source_category,''),'Sin categoría'),
    coalesce(nullif(t.subcategory_override,''),nullif(t.source_subcategory,''),''),
    coalesce(nullif(t.counterparty_override,''),nullif(t.source_counterparty,''),nullif(t.normalized_concept_override,''),nullif(t.source_normalized_concept,''),nullif(t.source_original_concept,''),'Sin contraparte'),
    coalesce(nullif(t.type_override,''),nullif(t.source_transaction_type,''),'Sin tipo'),
    t.account_id,a.account_role,a.cash_flow_enabled,
    t.source_missing,t.is_duplicate,t.is_internal_transfer,t.cash_flow_override,t.needs_review,t.status
  from financial_app.transactions t
  join financial_app.accounts a on a.id=t.account_id
  where not exists(select 1 from financial_app.transaction_splits s where s.transaction_id=t.id)
$function$;
