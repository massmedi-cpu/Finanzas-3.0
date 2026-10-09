-- Fresh candidate DB rehearsal revealed an invoker helper missing its gateway grant.
-- The trigger may call it when an observed transaction receives a builtin category.
-- Keep RLS, invoker execution and all public/client restrictions unchanged.
revoke all on function financial_app.resolve_category_leaf_id(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function financial_app.resolve_category_leaf_id(uuid,uuid) to financial_app_gateway;
-- The split snapshot also uses the hierarchy label under the same invoker role.
revoke all on function financial_app.category_display_name(uuid) from public,anon,authenticated,service_role;
grant execute on function financial_app.category_display_name(uuid) to financial_app_gateway;
