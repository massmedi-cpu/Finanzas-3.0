-- AP-6 disposable PostgreSQL performance laboratory: NEVER run on production.
-- Both source and derived rows are fictional. Entire fixture rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '90s';

INSERT INTO financial_app.workspaces(id,name) VALUES
  ('a0f00000-0000-4000-8000-000000000001','CAPACITY LAB synthetic only');
SELECT pg_catalog.set_config('financial_app.workspace_id','a0f00000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE financial_app_gateway;

CREATE TEMP TABLE cap_accounts (tag text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
WITH inserted AS (
  INSERT INTO financial_app.accounts(name,type,opening_balance_cents)
  VALUES ('CAPACITY 10k SYNTHETIC','checking',0),('CAPACITY 50k SYNTHETIC','checking',0)
  RETURNING id,name
)
INSERT INTO cap_accounts(tag,id)
SELECT CASE WHEN name LIKE '%10k%' THEN '10k' ELSE '50k' END,id FROM inserted;

CREATE TEMP TABLE cap_rows (
  tag text NOT NULL, n int NOT NULL, bank_date date NOT NULL,
  amount_cents bigint NOT NULL, kind text NOT NULL,
  PRIMARY KEY (tag,n)
) ON COMMIT DROP;
INSERT INTO cap_rows(tag,n,bank_date,amount_cents,kind)
SELECT cfg.tag, n,
  date '2022-01-01' + (n % 1700),
  CASE WHEN n % 10 = 0 THEN 200000::bigint ELSE -1300::bigint END,
  CASE WHEN n % 10 = 0 THEN 'income' ELSE 'expense' END
FROM (VALUES ('10k',10000),('50k',50000)) cfg(tag, total)
CROSS JOIN LATERAL generate_series(1,cfg.total) n;

WITH inserted AS (
  INSERT INTO financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,
    source_payload,bank_date,concept_original,amount_cents,balance_after_cents,account_external_key
  )
  SELECT '__cap_disposable__','synthetic',tag||'-'||n,'__cap_disposable__::'||tag||'-'||n,
    md5(tag||'-'||n)||md5('capacity:'||tag||'-'||n),
    jsonb_build_object('synthetic',true,'privateData',false),
    bank_date,'CAPACITY SYNTHETIC '||n,amount_cents,NULL,tag
  FROM cap_rows
  RETURNING id, source_row_key
)
INSERT INTO financial_app.transactions(
  source_record_id,source_row_identity,account_id,bank_date,concept_normalized,
  kind,amount_cents,balance_after_cents,review_state,duplicate_state
)
SELECT s.id,'__cap_disposable__::'||r.tag||'-'||r.n,a.id,r.bank_date,
  'CAPACITY SYNTHETIC '||r.n,r.kind,r.amount_cents,NULL,'confirmed','none'
FROM inserted s
-- Join on indexed typed (tag,n) keys instead of recomputing string
-- concatenation on all 60k fixture rows for each source record.
JOIN cap_rows r
  ON r.tag=split_part(s.source_row_key,'-',1)
 AND r.n=split_part(s.source_row_key,'-',2)::int
JOIN cap_accounts a ON a.tag=r.tag;

SET CONSTRAINTS ALL IMMEDIATE;
RESET ROLE;
ANALYZE financial_app.transactions;
ANALYZE financial_app.transaction_source_records;
SET LOCAL ROLE financial_app_gateway;

DO $capacity$
DECLARE
  v_row record;
  v_slice text;
  v_from date;
  v_to date;
  v_expected_count bigint;
  v_expected_income bigint;
  v_expected_expense bigint;
  v_actual jsonb;
  v_samples double precision[];
  v_started timestamptz;
  v_elapsed double precision;
  v_median double precision;
  v_p95 double precision;
  v_max double precision;
  v_n int;
BEGIN
  FOR v_row IN SELECT a.tag, a.id FROM cap_accounts a ORDER BY a.tag LOOP
    FOR v_slice IN SELECT unnest(ARRAY['full_history','single_month']) LOOP
      IF v_slice = 'full_history' THEN
        v_from := date '2022-01-01';
        v_to := date '2026-08-31';
      ELSE
        v_from := date '2026-06-01';
        v_to := date '2026-06-30';
      END IF;

      -- Fixture-derived reference independent of financial_period_summary.
      SELECT count(*)::bigint,
        coalesce(sum(amount_cents) FILTER (WHERE kind='income'),0)::bigint,
        coalesce(-sum(amount_cents) FILTER (WHERE kind='expense'),0)::bigint
      INTO v_expected_count,v_expected_income,v_expected_expense
      FROM cap_rows
      WHERE tag=v_row.tag AND bank_date BETWEEN v_from AND v_to;

      FOR v_n IN 1..2 LOOP
        PERFORM financial_app.financial_period_summary(v_from,v_to,v_row.id);
      END LOOP;
      v_samples := ARRAY[]::double precision[];
      FOR v_n IN 1..12 LOOP
        v_started := clock_timestamp();
        v_actual := financial_app.financial_period_summary(v_from,v_to,v_row.id);
        v_elapsed := extract(epoch FROM clock_timestamp() - v_started) * 1000.0;
        v_samples := array_append(v_samples,v_elapsed);

        IF (v_actual->'quality'->>'includedRows')::bigint IS DISTINCT FROM v_expected_count
          OR (v_actual->>'incomeCents')::bigint IS DISTINCT FROM v_expected_income
          OR (v_actual->>'expenseCents')::bigint IS DISTINCT FROM v_expected_expense
        THEN
          RAISE EXCEPTION 'CAPACITY_DB_FINANCIAL_PARITY_FAILED volume=% period=% result=% expected_count=% expected_income=% expected_expense=%',
            v_row.tag,v_slice,v_actual,v_expected_count,v_expected_income,v_expected_expense;
        END IF;
      END LOOP;
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY t),
        percentile_cont(0.95) WITHIN GROUP (ORDER BY t),max(t)
      INTO v_median,v_p95,v_max FROM unnest(v_samples) t;

      RAISE NOTICE 'CAPACITY_DB|scope=disposable_postgres17|volume=%|period=%|rows=%|median_ms=%|p95_lab_ms=%|max_ms=%|samples=12|warmups=2|expected_income_cents=%|expected_expense_cents=%',
        v_row.tag,v_slice,v_expected_count,round(v_median::numeric,2),round(v_p95::numeric,2),
        round(v_max::numeric,2),v_expected_income,v_expected_expense;
    END LOOP;
  END LOOP;
END $capacity$;

-- Verify there are no residual synthetic writes in any persistent table.
ROLLBACK;
