-- Financial App 6.0.0
-- One-time semantic migration: every document that existed at the captured
-- redesign baseline becomes archived. Newer documents remain unarchived.
-- Safe to run repeatedly: only rows with archived_at IS NULL are candidates.
-- Financial/document values and transaction links are intentionally untouched.

begin;

with candidates as materialized (
  select d.id, to_jsonb(d) as before_value
  from financial_app.documents d
  where d.archived_at is null
    and d.created_at <= timestamptz '2026-08-28 05:14:26.813505+00'
), updated as (
  update financial_app.documents d
  set archived_at = timestamptz '2026-08-28 05:14:26.813505+00',
      updated_at = now()
  from candidates c
  where d.id = c.id
  returning d.id, to_jsonb(d) as after_value
)
insert into financial_app.document_history(document_id,action,before_value,after_value,changed_by)
select u.id,
       'archive_v6_migration',
       c.before_value,
       u.after_value,
       'system:financial-app-6.0.0'
from updated u
join candidates c using(id);

commit;

-- Verification queries (read-only):
-- select count(*) from financial_app.documents
-- where created_at <= timestamptz '2026-08-28 05:14:26.813505+00'
--   and archived_at is null;
-- Expected after first and subsequent runs: 0.
