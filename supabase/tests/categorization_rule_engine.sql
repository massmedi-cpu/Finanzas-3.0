begin;

do $$
declare
  v_token text := replace(gen_random_uuid()::text,'-','');
  v_account uuid;
  v_source_category uuid;
  v_target_category uuid;
  v_merchant uuid;
  v_source uuid;
  v_transaction uuid;
  v_rule_high uuid;
  v_eval jsonb;
  v_apply jsonb;
  v_category uuid;
  v_merchant_after uuid;
begin
  insert into financial_app.accounts(name,institution,type,opening_balance_cents,currency,lifecycle,sort_order)
  values ('Rule account '||v_token,'Test','checking',0,'EUR','active',0) returning id into v_account;

  insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
  values ('Rule source '||v_token,'expense','test','neutral','active',0) returning id into v_source_category;
  insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
  values ('Rule target '||v_token,'expense','test','neutral','active',0) returning id into v_target_category;

  v_merchant := financial_app.save_merchant(null,'Café Regla '||v_token,v_source_category,'active');
  perform financial_app.save_merchant_alias(null,v_merchant,'TPV CAFÉ REGLA VIP '||v_token);

  insert into financial_app.transaction_source_records(
    source_file_id,source_sheet_id,source_row_key,source_fingerprint,source_payload,bank_date,
    concept_original,amount_cents,balance_after_cents,account_external_key,source_row_identity
  ) values (
    '__phase3_rule_sql__'||v_token,'sheet-1','ROW-1',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),
    jsonb_build_object('test',true),'2026-09-05','TPV CAFÉ REGLA VIP '||v_token,-12345,100000,'Rule account '||v_token,
    '__phase3_rule_sql__'||v_token||'::sheet-1::ROW-1'
  ) returning id into v_source;

  insert into financial_app.transactions(
    source_record_id,account_id,bank_date,concept_normalized,merchant_id,category_id,kind,amount_cents,
    balance_after_cents,review_state,duplicate_state,source_row_identity
  ) values (
    v_source,v_account,'2026-09-05','TPV CAFÉ REGLA VIP '||v_token,null,null,'expense',-12345,100000,'pending','none',
    '__phase3_rule_sql__'||v_token||'::sheet-1::ROW-1'
  ) returning id into v_transaction;

  perform financial_app.save_categorization_rule(
    null,'Disabled '||v_token,'disabled',0,'cafe',null,null,null,null,null,v_source_category,null
  );
  perform financial_app.save_categorization_rule(
    null,'Low '||v_token,'active',200,'cafe',null,null,null,null,null,v_source_category,null
  );
  v_rule_high := financial_app.save_categorization_rule(
    null,'High '||v_token,'active',10,'CAFÉ',v_merchant,v_account,v_source_category,-13000,-12000,v_target_category,null
  );

  v_eval := financial_app.evaluate_categorization_rule(v_transaction);
  if v_eval->>'selectedRuleId' <> v_rule_high::text then raise exception 'rule_priority_failed'; end if;
  if v_eval->>'baselineMerchantId' <> v_merchant::text then raise exception 'rule_merchant_match_failed'; end if;
  if v_eval->>'baselineCategoryId' <> v_source_category::text then raise exception 'rule_category_match_failed'; end if;
  if v_eval->>'resolvedCategoryId' <> v_target_category::text then raise exception 'rule_target_failed'; end if;

  v_apply := financial_app.apply_categorization_rule(v_transaction);
  select merchant_id,category_id into v_merchant_after,v_category from financial_app.transactions where id=v_transaction;
  if v_merchant_after is distinct from v_merchant or v_category is distinct from v_target_category then raise exception 'rule_apply_failed'; end if;
  if coalesce((v_apply->>'merchantChanged')::boolean,false) is not true or coalesce((v_apply->>'categoryChanged')::boolean,false) is not true then
    raise exception 'rule_change_report_failed';
  end if;

  insert into financial_app.transaction_overrides(transaction_id,category_id_override,category_override_set,note)
  values (v_transaction,v_source_category,true,'manual lock');
  v_apply := financial_app.apply_categorization_rule(v_transaction);
  if coalesce((v_apply->>'categoryLocked')::boolean,false) is not true then raise exception 'rule_override_lock_not_detected'; end if;
  if coalesce((v_apply->>'categoryChanged')::boolean,false) is true then raise exception 'rule_override_was_overwritten'; end if;
  if v_apply->>'resolvedCategoryId' <> v_source_category::text then raise exception 'rule_effective_override_not_preserved'; end if;
  select category_id into v_category from financial_app.transactions where id=v_transaction;
  if v_category is distinct from v_target_category then raise exception 'rule_base_changed_under_override'; end if;
end $$;

rollback;
