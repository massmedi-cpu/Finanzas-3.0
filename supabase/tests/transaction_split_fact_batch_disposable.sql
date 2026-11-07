-- Independent cents/category reference for the batched central fact engine.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database()<>'financial_app_pre001_disposable' THEN
    RAISE EXCEPTION 'SPLIT_FACT_BATCH_REQUIRES_DISPOSABLE_DB';
  END IF;
END $guard$;
BEGIN;
INSERT INTO financial_app.workspaces(id,name)
VALUES ('a0f20000-0000-4000-8000-000000000001','Split fact batch synthetic');
SELECT set_config('financial_app.workspace_id','a0f20000-0000-4000-8000-000000000001',true);
INSERT INTO financial_app.accounts(id,name,type,opening_balance_cents)
VALUES ('a0f20000-0000-4000-8000-000000000002','Split fact account','checking',0);
INSERT INTO financial_app.categories(id,name,kind,icon_key,color_token) VALUES
  ('a0f20000-0000-4000-8000-000000000003','Split batch A','expense','wallet','category.blue'),
  ('a0f20000-0000-4000-8000-000000000004','Split batch B','expense','wallet','category.blue');
DO $seed$
DECLARE n integer; source_id uuid; movement_id uuid; bank_amount bigint;
BEGIN
  FOR n IN 1..8 LOOP
    bank_amount:=CASE WHEN n=5 THEN -9000 ELSE -10000 END;
    INSERT INTO financial_app.transaction_source_records(source_file_id,source_sheet_id,
      source_row_key,source_row_identity,source_fingerprint,source_payload,bank_date,
      concept_original,amount_cents,account_external_key)
    VALUES ('__split_batch__','synthetic',n::text,'__split_batch__::'||n,
      md5('split:'||n)||md5('original:'||n),'{}'::jsonb,date '2026-09-01'+n-1,
      'Synthetic split '||n,bank_amount,'split-account') RETURNING id INTO source_id;
    INSERT INTO financial_app.transactions(source_record_id,source_row_identity,account_id,
      bank_date,concept_normalized,kind,amount_cents,review_state,duplicate_state)
    VALUES (source_id,'__split_batch__::'||n,'a0f20000-0000-4000-8000-000000000002',
      date '2026-09-01'+n-1,'Synthetic split '||n,CASE WHEN n=8 THEN 'transfer' ELSE 'expense' END,
      bank_amount,'confirmed',CASE WHEN n=6 THEN 'confirmed' ELSE 'none' END)
    RETURNING id INTO movement_id;
    UPDATE financial_app.transactions SET category_id=CASE WHEN n=8 THEN null
      ELSE 'a0f20000-0000-4000-8000-000000000003'::uuid END WHERE id=movement_id;
    IF n=2 THEN
      PERFORM financial_app.save_transaction_split(movement_id,
        '[{"amountCents":-6000,"scope":"personal"},{"amountCents":-4000,"scope":"other"}]'::jsonb);
    ELSIF n=3 THEN
      PERFORM financial_app.save_transaction_split(movement_id,
        '[{"amountCents":-4000,"scope":"other"},{"amountCents":-6000,"scope":"other"}]'::jsonb);
    ELSIF n=4 THEN
      PERFORM financial_app.save_transaction_split(movement_id,
        '[{"amountCents":-3000,"scope":"personal","categoryId":"a0f20000-0000-4000-8000-000000000003"},{"amountCents":-5000,"scope":"personal","categoryId":"a0f20000-0000-4000-8000-000000000004"},{"amountCents":-2000,"scope":"other"}]'::jsonb);
    ELSIF n=5 THEN
      -- Valid allocation snapshot from an earlier bank revision. The current
      -- source stays -9000; a stale -10000 split must not replace that amount.
      INSERT INTO financial_app.transaction_split_allocations(transaction_id,position,
        allocation_scope,amount_cents,source_amount_cents)
      VALUES (movement_id,0,'personal',-5000,-10000),(movement_id,1,'other',-5000,-10000);
    ELSIF n=6 THEN
      PERFORM financial_app.save_transaction_split(movement_id,
        '[{"amountCents":-7000,"scope":"personal"},{"amountCents":-3000,"scope":"other"}]'::jsonb);
    ELSIF n=7 THEN
      PERFORM financial_app.save_transaction_split(movement_id,
        '[{"amountCents":-8000,"scope":"personal"},{"amountCents":-2000,"scope":"other"}]'::jsonb);
      INSERT INTO financial_app.transaction_overrides(transaction_id,excluded_from_analytics)
      VALUES (movement_id,true);
    END IF;
  END LOOP;
END $seed$;
SET CONSTRAINTS ALL IMMEDIATE;
SET LOCAL ROLE financial_app_gateway;
DO $parity$
DECLARE invalid integer; period jsonb;
BEGIN
  WITH expected(n,amount,category,eligible) AS (VALUES
    (1,-10000,'a0f20000-0000-4000-8000-000000000003'::uuid,true),
    (2,-6000,'a0f20000-0000-4000-8000-000000000003'::uuid,true),
    (3,0,null::uuid,false),(4,-8000,null::uuid,true),
    (5,-9000,'a0f20000-0000-4000-8000-000000000003'::uuid,true),
    (6,-7000,'a0f20000-0000-4000-8000-000000000003'::uuid,false),
    (7,-8000,'a0f20000-0000-4000-8000-000000000003'::uuid,false),
    (8,-10000,null::uuid,true)
  ), actual AS (
    SELECT s.source_row_key::int AS n,f.* FROM financial_app.financial_transaction_facts(
      date '2026-09-01',date '2026-09-30','a0f20000-0000-4000-8000-000000000002') f
    JOIN financial_app.transactions t ON t.id=f.transaction_id
    JOIN financial_app.transaction_source_records s ON s.id=t.source_record_id
  ) SELECT count(*) INTO invalid FROM expected e FULL JOIN actual a ON a.n=e.n
    WHERE a.n IS NULL OR e.n IS NULL OR a.amount_cents IS DISTINCT FROM e.amount
      OR a.effective_category_id IS DISTINCT FROM e.category OR a.analytics_eligible IS DISTINCT FROM e.eligible;
  IF invalid<>0 THEN RAISE EXCEPTION 'SPLIT_FACT_BATCH_FINANCIAL_PARITY_FAILED count=%',invalid; END IF;
  period:=financial_app.financial_period_summary(date '2026-09-01',date '2026-09-30',
    'a0f20000-0000-4000-8000-000000000002');
  IF (period->>'expenseCents')::bigint<>33000 OR (period->>'operatingNetCents')::bigint<>-33000
    OR (period->'transfers'->>'grossCents')::bigint<>10000 THEN
    RAISE EXCEPTION 'SPLIT_FACT_BATCH_AGGREGATE_PARITY_FAILED';
  END IF;
  IF (SELECT count(*) FROM financial_app.financial_transaction_facts(date '2026-09-02',date '2026-09-02',
      'a0f20000-0000-4000-8000-000000000002'))<>1 THEN RAISE EXCEPTION 'SPLIT_FACT_BATCH_DATE_SCOPE_FAILED'; END IF;
  IF (SELECT sum(amount_cents) FROM financial_app.transactions WHERE account_id='a0f20000-0000-4000-8000-000000000002')<>-79000
    OR (SELECT sum(amount_cents) FROM financial_app.transaction_source_records WHERE source_file_id='__split_batch__')<>-79000 THEN
    RAISE EXCEPTION 'SPLIT_FACT_BATCH_CHANGED_BANK_AMOUNT';
  END IF;
  RAISE NOTICE 'SPLIT_FACT_BATCH|cases=8|personal_other=true|multi_category=true|stale_ignored=true|zero_excluded=true|duplicate_exclusion=true|manual_exclusion=true|transfer=true|source_unchanged=true';
END $parity$;
ROLLBACK;
