-- Financial App 3.7.4 — security hardening and canonical release metadata.
-- Keeps application access through authenticated RPCs while removing inherited anonymous EXECUTE privileges.

alter table financial_app.forecast_event_overrides enable row level security;
revoke all on table financial_app.forecast_event_overrides from public, anon, authenticated;
grant all on table financial_app.forecast_event_overrides to service_role;

revoke all on function financial_app.archive_delete_core(uuid) from public, anon;
grant execute on function financial_app.archive_delete_core(uuid) to authenticated, service_role;

revoke all on function financial_app.archive_restore_core(uuid) from public, anon;
grant execute on function financial_app.archive_restore_core(uuid) to authenticated, service_role;

revoke all on function financial_app.explainability_overview_core(integer) from public, anon;
grant execute on function financial_app.explainability_overview_core(integer) to authenticated, service_role;

revoke all on function financial_app.forecast_suggestions_v2(date,date) from public, anon;
grant execute on function financial_app.forecast_suggestions_v2(date,date) to authenticated, service_role;

revoke all on function financial_app.movements_advanced_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) from public, anon;
grant execute on function financial_app.movements_advanced_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) to authenticated, service_role;

revoke all on function financial_app.movements_advanced_enriched_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) from public, anon;
grant execute on function financial_app.movements_advanced_enriched_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) to authenticated, service_role;

revoke all on function financial_app.run_system_audit_core() from public, anon;
grant execute on function financial_app.run_system_audit_core() to authenticated, service_role;

revoke all on function financial_app.system_integrity_overview_core() from public, anon;
grant execute on function financial_app.system_integrity_overview_core() to authenticated, service_role;

revoke all on function financial_app.system_integrity_snapshot_core(boolean) from public, anon;
grant execute on function financial_app.system_integrity_snapshot_core(boolean) to authenticated, service_role;

revoke all on function financial_app.transaction_document_matches_core(uuid) from public, anon;
grant execute on function financial_app.transaction_document_matches_core(uuid) to authenticated, service_role;

insert into financial_app.app_meta(key,value,updated_at)
values
  ('app_version',to_jsonb('3.7.4'::text),now()),
  ('target_version',to_jsonb('3.7.4'::text),now())
on conflict(key) do update
set value=excluded.value,updated_at=excluded.updated_at;
