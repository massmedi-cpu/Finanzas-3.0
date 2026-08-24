begin;

create or replace function financial_app.effective_reconciliation_status(t financial_app.transactions)
returns text
language sql
immutable
security invoker
set search_path to 'pg_catalog','financial_app'
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

insert into financial_app.app_meta(key,value,updated_at)
values ('app_version',to_jsonb('3.4.3'::text),now()),('target_version',to_jsonb('3.4.3'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

commit;
