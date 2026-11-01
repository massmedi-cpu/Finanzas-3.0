-- REC-AP8-POST-DDL: current 10.0.103 authentic restored backup, whose
-- five DDL migrations are ALREADY present. Never reapply them.
-- The surrounding runner verifies SHA, GPG ciphertext and restore identity.
-- Post-DDL data and balance checks are READ ONLY and only run on localhost PG17.
\set ON_ERROR_STOP on
SET statement_timeout='90s';
BEGIN READ ONLY;
DO $check$
DECLARE
  a record;
  m jsonb;
  period_rows jsonb;
  canonical jsonb;
  owner_workspace uuid;
  scoped int := 0;
  total int := 0;
  active_accounts int := 0;
  archived_accounts int := 0;
BEGIN
  IF current_database() <> 'financial_app_production_backup_restore_check'
    OR current_user <> 'postgres'
    OR (SELECT count(*) FROM financial_app.transaction_source_records)<>3188
    OR (SELECT count(*) FROM financial_app.transactions)<>3188
    OR (SELECT count(*) FROM financial_app.documents)<>2
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
        WHERE n.nspname='financial_app' AND c.relkind='r')<>32
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
        WHERE n.nspname='financial_app' AND c.relkind='r' AND c.relrowsecurity)<>32
    OR (SELECT count(*) FROM pg_trigger t WHERE t.tgname='documents_private_original_rewrite_guard'
        AND t.tgenabled='O' AND NOT t.tgisinternal)<>1
    OR to_regprocedure('financial_app.prevent_private_original_rewrite()') IS NULL
    OR EXISTS (SELECT 1 FROM financial_app.transactions t
       LEFT JOIN financial_app.transaction_source_records s ON s.id=t.source_record_id WHERE s.id IS NULL)
    OR EXISTS (SELECT 1 FROM financial_app.transaction_source_records s
       LEFT JOIN financial_app.transactions t ON t.source_record_id=s.id WHERE t.id IS NULL)
  THEN RAISE EXCEPTION 'REC_AP8_POST_DDL_BACKUP_INCONSISTENT'; END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('financial_app.prevent_private_original_rewrite()')) IS DISTINCT FROM false
    OR has_function_privilege('anon','financial_app.prevent_private_original_rewrite()','EXECUTE')
    OR has_function_privilege('authenticated','financial_app.prevent_private_original_rewrite()','EXECUTE')
    OR NOT has_function_privilege('financial_app_gateway','financial_app.prevent_private_original_rewrite()','EXECUTE')
  THEN RAISE EXCEPTION 'REC_AP8_POST_DDL_BAD_GUARD_PERMISSIONS'; END IF;
  SELECT workspace_id INTO owner_workspace FROM financial_app.accounts LIMIT 1;
  IF owner_workspace IS NULL THEN RAISE EXCEPTION 'REC_AP8_POST_DDL_MISSING_WORKSPACE'; END IF;
  PERFORM pg_catalog.set_config('financial_app.workspace_id',owner_workspace::text,true);
  FOR a IN SELECT id,lifecycle FROM financial_app.accounts ORDER BY id LOOP
    IF a.lifecycle='active' THEN active_accounts:=active_accounts+1;
    ELSIF a.lifecycle='archived' THEN archived_accounts:=archived_accounts+1;
    ELSE RAISE EXCEPTION 'REC_AP8_POST_DDL_UNEXPECTED_LIFECYCLE'; END IF;
    period_rows:=financial_app.financial_balance_series(date '2018-11-01',date '2026-10-25',a.id);
    IF jsonb_array_length(period_rows->'rows')<>96 THEN
      RAISE EXCEPTION 'REC_AP8_POST_DDL_SCOPED_MONTHS_MISSING'; END IF;
    FOR m IN SELECT value FROM jsonb_array_elements(period_rows->'rows') LOOP
      scoped:=scoped+1;
      canonical:=financial_app.financial_account_balances((m->>'asOfDate')::date,false,a.id);
      IF (m->>'balanceCents')::bigint IS DISTINCT FROM (canonical->>'totalBalanceCents')::bigint
        OR m->>'monthStart' IS NULL OR m->>'asOfDate' IS NULL
      THEN RAISE EXCEPTION 'REC_AP8_POST_DDL_SCOPED_BALANCE_INCORRECT'; END IF;
    END LOOP;
  END LOOP;
  IF active_accounts<>2 OR archived_accounts<>1 OR scoped<>288 THEN
    RAISE EXCEPTION 'REC_AP8_POST_DDL_ACCOUNT_MATRIX_MISSING'; END IF;
  period_rows:=financial_app.financial_balance_series(date '2018-11-01',date '2026-10-25',NULL);
  IF jsonb_array_length(period_rows->'rows')<>96 THEN
    RAISE EXCEPTION 'REC_AP8_POST_DDL_GLOBAL_MONTHS_MISSING'; END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(period_rows->'rows') LOOP
    total:=total+1;
    canonical:=financial_app.financial_account_balances((m->>'asOfDate')::date,false,NULL);
    IF (m->>'balanceCents')::bigint IS DISTINCT FROM (canonical->>'activeBalanceCents')::bigint
    THEN RAISE EXCEPTION 'REC_AP8_POST_DDL_GLOBAL_BALANCE_INCORRECT'; END IF;
  END LOOP;
  IF total<>96 OR scoped+total<>384 THEN
    RAISE EXCEPTION 'REC_AP8_POST_DDL_TOTAL_MONTHS_MISSING'; END IF;
END $check$;
SELECT 'REC_AP8_POST_DDL|status=ok|checked_points=384|data_read_only=true' AS result;
COMMIT;
