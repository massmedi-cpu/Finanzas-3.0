-- AP1/AP2: transactionally COMMITTED, synthetic two-tenant persistence fixture.
-- NEVER run on Supabase production. Only CI's disposable Postgres 17 database.
-- The outer CI shell creates and drops the ENTIRE local database; no user data.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO financial_app.workspaces(id,name) VALUES
  ('aa110000-0000-4000-8000-000000000001','AP1AP2 disposable tenant A'),
  ('bb220000-0000-4000-8000-000000000002','AP1AP2 disposable tenant B');

-- Gateway must never possess mutation privileges on immutable source records.
DO $security$
BEGIN
  IF (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='financial_app_gateway') THEN
    RAISE EXCEPTION 'AP1_GATEWAY_RLS_BYPASS';
  END IF;
  IF has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','UPDATE')
    OR has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','DELETE')
  THEN
    RAISE EXCEPTION 'AP1_SOURCE_RECORD_MUTATION_PRIVILEGE';
  END IF;
END $security$;

SET LOCAL ROLE financial_app_gateway;
SELECT pg_catalog.set_config('financial_app.workspace_id','aa110000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('financial_app.user_id','cc330000-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('financial_app.workspace_role','owner',true);
SELECT pg_catalog.set_config('financial_app.workspace_membership_count','1',true);

INSERT INTO financial_app.accounts(id,name,type,opening_balance_cents)
VALUES ('aa110000-0000-4000-8000-000000000011','AP1AP2 account','checking',125000);

INSERT INTO financial_app.categories(id,name,kind,icon_key,color_token)
VALUES ('aa110000-0000-4000-8000-000000000033','AP1AP2 expense','expense','wallet','neutral');

-- Real business SQL functions, not mocked API responses.
SELECT financial_app.set_budget_manual_amount('2026-09',NULL,123456);
SELECT financial_app.set_budget_manual_amount(
  '2026-09','aa110000-0000-4000-8000-000000000033'::uuid,34567
);

DO $tenant_a$
DECLARE v_count int; v_total bigint; v_category bigint;
BEGIN
  SELECT count(*) INTO v_count FROM financial_app.budgets WHERE month='2026-09';
  SELECT manual_amount_cents INTO v_total FROM financial_app.budgets
    WHERE month='2026-09' AND category_id IS NULL;
  SELECT manual_amount_cents INTO v_category FROM financial_app.budgets
    WHERE month='2026-09' AND category_id='aa110000-0000-4000-8000-000000000033'::uuid;
  IF v_count <> 2 OR v_total IS DISTINCT FROM 123456 OR v_category IS DISTINCT FROM 34567 THEN
    RAISE EXCEPTION 'AP2_TENANT_A_INITIAL_PERSISTENCE_FAILED';
  END IF;
END $tenant_a$;

-- Same physical backend, different workspace: zero rows from tenant A.
SELECT pg_catalog.set_config('financial_app.workspace_id','bb220000-0000-4000-8000-000000000002',true);
DO $isolation$
DECLARE v_accounts int; v_categories int; v_budgets int; v_blocked boolean := false; v_cross_updates int;
BEGIN
  SELECT count(*) INTO v_accounts FROM financial_app.accounts;
  SELECT count(*) INTO v_categories FROM financial_app.categories;
  SELECT count(*) INTO v_budgets FROM financial_app.budgets;
  IF v_accounts <> 0 OR v_categories <> 0 OR v_budgets <> 0 THEN
    RAISE EXCEPTION 'AP1_CROSS_TENANT_READ_LEAK';
  END IF;

  UPDATE financial_app.budgets
  SET manual_amount_cents=999999
  WHERE month='2026-09' AND category_id IS NULL;
  GET DIAGNOSTICS v_cross_updates = ROW_COUNT;
  IF v_cross_updates <> 0 THEN RAISE EXCEPTION 'AP1_CROSS_TENANT_WRITE_LEAK'; END IF;

  BEGIN
    PERFORM financial_app.set_budget_manual_amount(
      '2026-09','aa110000-0000-4000-8000-000000000033'::uuid,333
    );
  EXCEPTION WHEN OTHERS THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'AP1_CROSS_TENANT_CATEGORY_REFERENCE_ACCEPTED'; END IF;
END $isolation$;

INSERT INTO financial_app.accounts(id,name,type,opening_balance_cents)
VALUES ('bb220000-0000-4000-8000-000000000022','AP1AP2 account','checking',50000);

INSERT INTO financial_app.categories(id,name,kind,icon_key,color_token)
VALUES ('bb220000-0000-4000-8000-000000000044','AP1AP2 expense','expense','wallet','neutral');

SELECT financial_app.set_budget_manual_amount('2026-09',NULL,654321);
SELECT financial_app.set_budget_manual_amount(
  '2026-09','bb220000-0000-4000-8000-000000000044'::uuid,45678
);

DO $tenant_b$
DECLARE v_count int; v_total bigint;
BEGIN
  SELECT count(*) INTO v_count FROM financial_app.budgets WHERE month='2026-09';
  SELECT manual_amount_cents INTO v_total FROM financial_app.budgets
    WHERE month='2026-09' AND category_id IS NULL;
  IF v_count <> 2 OR v_total IS DISTINCT FROM 654321 THEN
    RAISE EXCEPTION 'AP2_TENANT_B_INITIAL_PERSISTENCE_FAILED';
  END IF;
END $tenant_b$;

-- COMMIT deliberately: the second psql process MUST read durable data through
-- a new PostgreSQL session rather than merely sharing a transaction snapshot.
COMMIT;
\echo 'AP1AP2_DISPOSABLE|seed_committed=true|synthetic=true'
