-- Financial App 9.0.1 · Control RPC wrapper repair
--
-- Private *_core functions deliberately remain non-executable by PUBLIC, anon,
-- authenticated and service_role. Public authenticated wrappers therefore must
-- execute as their owner while preserving the caller JWT used by authorized_email().
-- Every wrapper already has an explicit hardened search_path:
--   pg_catalog, financial_app, auth

alter function public.financial_app_archive_link_calibrated(uuid,text) security definer;
alter function public.financial_app_archive_unlink_calibrated(uuid,text) security definer;
alter function public.financial_app_document_matching_calibration(integer) security definer;
alter function public.financial_app_document_matching_observability(integer) security definer;
alter function public.financial_app_document_matching_policy_apply(bigint) security definer;
alter function public.financial_app_document_matching_policy_dashboard(integer) security definer;
alter function public.financial_app_document_matching_policy_generate(integer) security definer;
alter function public.financial_app_document_matching_policy_reject(bigint) security definer;
alter function public.financial_app_document_matching_policy_rollback() security definer;

revoke all on function public.financial_app_archive_link_calibrated(uuid,text) from public, anon;
revoke all on function public.financial_app_archive_unlink_calibrated(uuid,text) from public, anon;
revoke all on function public.financial_app_document_matching_calibration(integer) from public, anon;
revoke all on function public.financial_app_document_matching_observability(integer) from public, anon;
revoke all on function public.financial_app_document_matching_policy_apply(bigint) from public, anon;
revoke all on function public.financial_app_document_matching_policy_dashboard(integer) from public, anon;
revoke all on function public.financial_app_document_matching_policy_generate(integer) from public, anon;
revoke all on function public.financial_app_document_matching_policy_reject(bigint) from public, anon;
revoke all on function public.financial_app_document_matching_policy_rollback() from public, anon;

grant execute on function public.financial_app_archive_link_calibrated(uuid,text) to authenticated, service_role;
grant execute on function public.financial_app_archive_unlink_calibrated(uuid,text) to authenticated, service_role;
grant execute on function public.financial_app_document_matching_calibration(integer) to authenticated, service_role;
grant execute on function public.financial_app_document_matching_observability(integer) to authenticated, service_role;
grant execute on function public.financial_app_document_matching_policy_apply(bigint) to authenticated, service_role;
grant execute on function public.financial_app_document_matching_policy_dashboard(integer) to authenticated, service_role;
grant execute on function public.financial_app_document_matching_policy_generate(integer) to authenticated, service_role;
grant execute on function public.financial_app_document_matching_policy_reject(bigint) to authenticated, service_role;
grant execute on function public.financial_app_document_matching_policy_rollback() to authenticated, service_role;
