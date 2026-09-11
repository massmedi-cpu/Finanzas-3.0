\set ON_ERROR_STOP on
begin transaction read only;

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from (values
    ('phase3_merchant_alias_engine','ddc0be92727a8210eeed3c434cb5acab'),
    ('phase3_categorization_rule_engine','b30c34c5f667e02e2b4271ecd91f7c09'),
    ('phase4_duplicate_transfer_engine','f126235127d35056fd6b599e97e3914e'),
    ('phase4_duplicate_transfer_hardening','58fa7c7491a4d291a4e2e253c00b6361'),
    ('phase4_transfer_effective_kind_consistency','49c9659cb8d28fe8921bee8089eba177'),
    ('phase5_financial_logic_core','abcabaa2b2a84c0230450142f3eef747'),
    ('phase7_recurrence_engine_core','ef5422f73a54caa2b1cbe9966fd1d6c9'),
    ('phase7_recurrence_freshness','252e3cbdc17dd991ae5a5c97c61dae39'),
    ('phase7_server_resolved_candidate_persistence','e8be27b5851e7a2edd7b07688c26cffa'),
    ('phase8_forecast_engine_core','7356fe394bea39f83a23675acdb9fe3f'),
    ('phase8_forecast_audit_contract','9db883f9bbad5abe593cb9eb0f63328c'),
    ('phase8_reconciliation_candidates','289a08ac253937ae717b080681c68de5'),
    ('phase8_reactivate_system_superseded_forecasts','c646e88020c908114debc251d26bc170'),
    ('phase8_nonzero_manual_forecasts','3a58868fdd6a5f216f77293b253c945c'),
    ('phase9_document_engine_core','1f95606bbaa5cbdf2ffe720154e70a96'),
    ('phase9_document_candidate_order_fix','620aea3968a970c7958ddc0b91cccc97'),
    ('pre007_forecast_write_integrity','dcef1afd150274f6769a198432d69d48')
  ) expected(name,statements_md5)
  left join supabase_migrations.schema_migrations m on m.name=expected.name
  where m.name is null
     or md5(array_to_string(m.statements,E'\n')) <> expected.statements_md5;

  if v_count <> 0 then
    raise exception 'backend_history_fingerprint_mismatch:%', v_count;
  end if;
end
$$;

select 'FINANCIAL_APP_BACKEND_HISTORY_FINGERPRINT_OK' as status;
rollback;
