-- Financial App 9.0.0 · pure helper permissions for obligation identity
-- These functions accept only caller-supplied scalar text and expose no stored data.

revoke all on function financial_app.forecast_is_annual_signal(text,text,text) from public, anon;
revoke all on function financial_app.forecast_norm(text) from public, anon;

grant execute on function financial_app.forecast_is_annual_signal(text,text,text) to authenticated, service_role;
grant execute on function financial_app.forecast_norm(text) to authenticated, service_role;