-- AP6: keep the same workspace predicate and write check, evaluated once
-- per SQL statement. No shared cache, role/grant change or RLS relaxation.
begin;

DO $policy_guard$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT c.relname,p.polname,pg_get_expr(p.polqual,p.polrelid) AS predicate,
      pg_get_expr(p.polwithcheck,p.polrelid) AS write_check
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='financial_app'
      AND c.relname IN ('transactions','transaction_source_records')
      AND p.polname=c.relname||'_workspace_isolation'
  LOOP
    IF item.predicate IS DISTINCT FROM '(workspace_id = financial_app.require_current_workspace_id())'
      OR item.write_check IS DISTINCT FROM '(workspace_id = financial_app.require_current_workspace_id())' THEN
      RAISE EXCEPTION 'workspace_policy_definition_changed_%',item.relname;
    END IF;
  END LOOP;
END $policy_guard$;

alter policy transactions_workspace_isolation on financial_app.transactions
  using (workspace_id = (select financial_app.require_current_workspace_id()))
  with check (workspace_id = (select financial_app.require_current_workspace_id()));
alter policy transaction_source_records_workspace_isolation on financial_app.transaction_source_records
  using (workspace_id = (select financial_app.require_current_workspace_id()))
  with check (workspace_id = (select financial_app.require_current_workspace_id()));

commit;
