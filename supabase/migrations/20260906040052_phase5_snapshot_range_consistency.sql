begin;

create or replace function financial_app.financial_snapshot(
  p_date_from date default null,
  p_date_to date default null,
  p_account_id uuid default null,
  p_include_archived boolean default false
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_period jsonb;
  v_date_from date;
  v_date_to date;
begin
  v_period := financial_app.financial_period_summary(p_date_from,p_date_to,p_account_id);
  v_date_from := nullif(v_period->>'dateFrom','')::date;
  v_date_to := nullif(v_period->>'dateTo','')::date;

  return jsonb_build_object(
    'contractVersion',1,
    'period',v_period,
    'balances',financial_app.financial_account_balances(v_date_to,p_include_archived,p_account_id),
    'monthly',financial_app.financial_monthly_series(v_date_from,v_date_to,p_account_id),
    'principles',jsonb_build_object(
      'bankSource','read_only',
      'transfersExcludedFromSavings',true,
      'suspectedDuplicatesIncluded',true,
      'confirmedDuplicatesExcluded',true,
      'manualAnalyticsExclusionRespected',true,
      'explicitBankBalancePreferred',true
    )
  );
end;
$$;

revoke all on function financial_app.financial_snapshot(date,date,uuid,boolean) from public,anon,authenticated;
grant execute on function financial_app.financial_snapshot(date,date,uuid,boolean) to service_role;

update financial_app.schema_meta set updated_at=now() where id=true;

commit;
