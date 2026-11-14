-- Category label batching must preserve search, manual overrides, cursors and RLS.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database()<>'financial_app_production_backup_restore_check' THEN
    RAISE EXCEPTION 'CATEGORY_LABEL_BATCH_REQUIRES_DISPOSABLE_DB';
  END IF;
END $guard$;
BEGIN;
INSERT INTO financial_app.workspaces(id,name) VALUES
  ('a0f10000-0000-4000-8000-000000000001','Category label batch A'),
  ('a0f10000-0000-4000-8000-000000000002','Category label batch B');
SELECT set_config('financial_app.workspace_id','a0f10000-0000-4000-8000-000000000001',true);
INSERT INTO financial_app.accounts(id,name,type,opening_balance_cents)
VALUES ('a0f10000-0000-4000-8000-000000000006','Category label account','checking',0);
INSERT INTO financial_app.categories(id,name,kind,icon_key,color_token) VALUES
  ('a0f10000-0000-4000-8000-000000000003','Label Batch Root A','expense','wallet','category.blue'),
  ('a0f10000-0000-4000-8000-000000000005','Label Batch Root B','expense','wallet','category.blue');
INSERT INTO financial_app.categories(id,name,kind,parent_category_id,icon_key,color_token)
VALUES ('a0f10000-0000-4000-8000-000000000004','Label Batch Leaf A','expense',
  'a0f10000-0000-4000-8000-000000000003','wallet','category.blue');
DO $seed$
DECLARE n integer; source_id uuid; movement_id uuid;
BEGIN
  FOR n IN 1..4 LOOP
    INSERT INTO financial_app.transaction_source_records(source_file_id,source_sheet_id,
      source_row_key,source_row_identity,source_fingerprint,source_payload,bank_date,
      concept_original,amount_cents,account_external_key)
    VALUES ('__label_batch__','synthetic',n::text,'__label_batch__::'||n,
      md5('label:'||n)||md5('original:'||n),'{}'::jsonb,date '2026-09-10',
      'Synthetic movement '||n,-100*n,'label-account') RETURNING id INTO source_id;
    INSERT INTO financial_app.transactions(source_record_id,source_row_identity,account_id,
      bank_date,concept_normalized,kind,amount_cents,category_id,review_state,duplicate_state)
    VALUES (source_id,'__label_batch__::'||n,'a0f10000-0000-4000-8000-000000000006',
      date '2026-09-10','Synthetic movement '||n,'expense',-100*n,
      CASE WHEN n IN (1,4) THEN 'a0f10000-0000-4000-8000-000000000004'::uuid
        WHEN n=2 THEN 'a0f10000-0000-4000-8000-000000000005'::uuid ELSE null END,
      'confirmed','none') RETURNING id INTO movement_id;
    -- The real INSERT trigger applies automatic categorization. Restore the
    -- fixture's explicit original category afterwards without disabling it.
    -- A category-only update does not run source-change categorization again.
    UPDATE financial_app.transactions SET category_id=
      CASE WHEN n IN (1,4) THEN 'a0f10000-0000-4000-8000-000000000004'::uuid
        WHEN n=2 THEN 'a0f10000-0000-4000-8000-000000000005'::uuid ELSE null END
    WHERE id=movement_id;
    IF n=4 THEN
      INSERT INTO financial_app.transaction_overrides(transaction_id,category_override_set,category_id_override)
      VALUES (movement_id,true,'a0f10000-0000-4000-8000-000000000005');
    END IF;
  END LOOP;
END $seed$;
SELECT set_config('financial_app.workspace_id','a0f10000-0000-4000-8000-000000000002',true);
INSERT INTO financial_app.categories(id,name,kind,icon_key,color_token)
VALUES ('a0f10000-0000-4000-8000-000000000009','Foreign Category Secret','expense','wallet','category.blue');

SET LOCAL ROLE financial_app_gateway;
SELECT set_config('financial_app.workspace_id','a0f10000-0000-4000-8000-000000000001',true);
DO $parity$
DECLARE all_rows jsonb; page_one jsonb; page_two jsonb; item jsonb;
  account uuid:='a0f10000-0000-4000-8000-000000000006'; expected_label text;
BEGIN
  all_rows:=financial_app.query_effective_transactions_v4(p_account_id=>account);
  IF (all_rows->>'totalCount')::int<>4 THEN RAISE EXCEPTION 'LABEL_BATCH_WRONG_SCOPE'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(all_rows->'rows') LOOP
    expected_label:=CASE item->'source'->>'sourceRowKey'
      WHEN '1' THEN 'Label Batch Root A › Label Batch Leaf A'
      WHEN '2' THEN 'Label Batch Root B' WHEN '4' THEN 'Label Batch Root B' ELSE null END;
    IF (item->'category'->>'effectiveName') IS DISTINCT FROM expected_label
      OR (item->>'amountCents')::int IS DISTINCT FROM -100*(item->'source'->>'sourceRowKey')::int THEN
      RAISE EXCEPTION 'LABEL_BATCH_CHANGED_LABEL_OR_AMOUNT synthetic_key=% label=% expected=% amount=%',
        item->'source'->>'sourceRowKey',item->'category'->>'effectiveName',expected_label,item->>'amountCents';
    END IF;
    IF item->'source'->>'sourceRowKey'='4'
      AND item->'category'->>'originalName'<>'Label Batch Root A › Label Batch Leaf A' THEN
      RAISE EXCEPTION 'LABEL_BATCH_LOST_ORIGINAL_LABEL';
    END IF;
  END LOOP;
  IF (financial_app.query_effective_transactions_v4(p_query=>'Label Batch Root A',p_account_id=>account)->>'totalCount')::int<>1
    OR (financial_app.query_effective_transactions_v4(p_query=>'Label Batch Leaf A',p_account_id=>account)->>'totalCount')::int<>1
    OR (financial_app.query_effective_transactions_v4(p_query=>'  label batch root a  ',p_account_id=>account)->>'totalCount')::int<>1
    OR (financial_app.query_effective_transactions_v4(p_query=>'Label Batch Root B',p_account_id=>account)->>'totalCount')::int<>2
    OR (financial_app.query_effective_transactions_v4(p_category_id=>'a0f10000-0000-4000-8000-000000000003',p_account_id=>account)->>'totalCount')::int<>1
    OR (financial_app.query_effective_transactions_v4(p_uncategorized=>true,p_account_id=>account)->>'totalCount')::int<>1 THEN
    RAISE EXCEPTION 'LABEL_BATCH_CHANGED_SEARCH_OR_CATEGORY_FILTER';
  END IF;
  IF financial_app.category_display_name('a0f10000-0000-4000-8000-000000000009') IS NOT NULL
    OR (financial_app.query_effective_transactions_v4(p_query=>'Foreign Category Secret',p_account_id=>account)->>'totalCount')::int<>0 THEN
    RAISE EXCEPTION 'LABEL_BATCH_CROSS_WORKSPACE_LEAK';
  END IF;
  -- The statement-local workspace value must change on the next query in
  -- this same connection, even when PL/pgSQL reuses its prepared query plan.
  PERFORM set_config('financial_app.workspace_id','a0f10000-0000-4000-8000-000000000002',true);
  IF (financial_app.query_effective_transactions_v4(p_account_id=>account)->>'totalCount')::int<>0
    OR EXISTS(SELECT 1 FROM financial_app.transaction_source_records WHERE source_file_id='__label_batch__') THEN
    RAISE EXCEPTION 'STATEMENT_WORKSPACE_CONTEXT_STALE_OR_LEAKED';
  END IF;
  PERFORM set_config('financial_app.workspace_id','a0f10000-0000-4000-8000-000000000001',true);
  IF (financial_app.query_effective_transactions_v4(p_account_id=>account)->>'totalCount')::int<>4 THEN
    RAISE EXCEPTION 'STATEMENT_WORKSPACE_CONTEXT_NOT_RESTORED';
  END IF;
  page_one:=financial_app.query_effective_transactions_v4(p_account_id=>account,p_limit=>2);
  page_two:=financial_app.query_effective_transactions_v4(p_account_id=>account,p_limit=>2,
    p_cursor_bank_date=>(page_one->'nextCursor'->>'bankDate')::date,
    p_cursor_id=>(page_one->'nextCursor'->>'id')::uuid);
  IF (page_one->>'hasMore')::boolean IS DISTINCT FROM true
    OR (page_two->>'hasMore')::boolean IS DISTINCT FROM false
    OR (page_two->>'totalCount')::int<>4
    OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements((page_one->'rows')||(page_two->'rows')) x)<>4 THEN
    RAISE EXCEPTION 'LABEL_BATCH_CHANGED_KEYSET_PAGINATION';
  END IF;
  RAISE NOTICE 'CATEGORY_LABEL_BATCH|parent_leaf=true|manual_override=true|null_preserved=true|search_exact=true|cursor_parity=true|cross_workspace_denied=true';
END $parity$;
ROLLBACK;
