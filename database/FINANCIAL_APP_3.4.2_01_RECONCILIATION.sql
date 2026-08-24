begin;

create or replace function financial_app.effective_reconciliation_status(t financial_app.transactions)
returns text language sql immutable security invoker
as $function$
  select case
    when t.is_reconciled is true then 'reconciled'
    when t.is_reconciled is false then 'not_reconciled'
    when lower(trim(coalesce(t.source_reconciled,''))) in ('sí','si','yes','true','1') then 'reconciled'
    when lower(trim(coalesce(t.source_reconciled,'')))='no aplica' then 'not_applicable'
    when lower(trim(coalesce(t.source_reconciled,'')))='pendiente' then 'pending'
    when lower(trim(coalesce(t.source_reconciled,''))) in ('no','false','0') then 'not_reconciled'
    else 'pending'
  end
$function$;

create or replace function financial_app.reconciliation_summary_core()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare v_email text:=financial_app.authorized_email();v_summary jsonb;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  with statuses as materialized(
    select financial_app.effective_reconciliation_status(t) status from financial_app.transactions t
  )
  select jsonb_build_object(
    'total',count(*),
    'reconciled',count(*) filter(where status='reconciled'),
    'pending',count(*) filter(where status='pending'),
    'notReconciled',count(*) filter(where status='not_reconciled'),
    'notApplicable',count(*) filter(where status='not_applicable')
  ) into v_summary from statuses;
  return v_summary;
end
$function$;

revoke execute on function financial_app.reconciliation_summary_core() from public,anon,authenticated;
grant execute on function financial_app.reconciliation_summary_core() to service_role;

commit;
