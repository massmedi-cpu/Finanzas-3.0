revoke execute on function financial_app.merge_categories(uuid, uuid) from public, anon, authenticated;
revoke execute on function financial_app.normalize_label(text) from public, anon, authenticated;
revoke execute on function financial_app.prepare_merchant_alias_identity() from public, anon, authenticated;
revoke execute on function financial_app.prepare_merchant_identity() from public, anon, authenticated;
revoke execute on function financial_app.protect_bank_source_record() from public, anon, authenticated;
revoke execute on function financial_app.reorder_accounts(uuid[]) from public, anon, authenticated;
revoke execute on function financial_app.reorder_categories(uuid[]) from public, anon, authenticated;
revoke execute on function financial_app.touch_updated_at() from public, anon, authenticated;
revoke execute on function financial_app.validate_category_parent() from public, anon, authenticated;

grant execute on function financial_app.merge_categories(uuid, uuid) to service_role;
grant execute on function financial_app.normalize_label(text) to service_role;
grant execute on function financial_app.prepare_merchant_alias_identity() to service_role;
grant execute on function financial_app.prepare_merchant_identity() to service_role;
grant execute on function financial_app.protect_bank_source_record() to service_role;
grant execute on function financial_app.reorder_accounts(uuid[]) to service_role;
grant execute on function financial_app.reorder_categories(uuid[]) to service_role;
grant execute on function financial_app.touch_updated_at() to service_role;
grant execute on function financial_app.validate_category_parent() to service_role;
