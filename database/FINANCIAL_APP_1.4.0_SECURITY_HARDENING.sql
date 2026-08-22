-- Financial App 1.4.0 · endurecimiento de wrappers públicos
-- Los endpoints públicos permanecen SECURITY INVOKER; la elevación se limita a núcleos internos
-- que vuelven a comprobar la allowlist mediante financial_app.authorized_email().

alter function public.financial_app_control_center(date) security invoker;
alter function public.financial_app_set_control_alert_state(text,text,integer,text) security invoker;
alter function public.financial_app_close_month(date,text) security invoker;
alter function public.financial_app_reopen_month(date) security invoker;
alter function public.financial_app_movements_advanced_v14(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) security invoker;

grant execute on function financial_app.control_center_core(date) to authenticated;
grant execute on function financial_app.set_control_alert_state_core(text,text,integer,text) to authenticated;
grant execute on function financial_app.close_month_core(date,text) to authenticated;
grant execute on function financial_app.reopen_month_core(date) to authenticated;
grant execute on function financial_app.movements_advanced_v14_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) to authenticated;
grant execute on function financial_app.movements_advanced_v14_enriched_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) to authenticated;

revoke all on function financial_app.control_center_core(date) from anon, public;
revoke all on function financial_app.set_control_alert_state_core(text,text,integer,text) from anon, public;
revoke all on function financial_app.close_month_core(date,text) from anon, public;
revoke all on function financial_app.reopen_month_core(date) from anon, public;
revoke all on function financial_app.movements_advanced_v14_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) from anon, public;
revoke all on function financial_app.movements_advanced_v14_enriched_core(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) from anon, public;

revoke all on function public.financial_app_control_center(date) from anon, public;
revoke all on function public.financial_app_set_control_alert_state(text,text,integer,text) from anon, public;
revoke all on function public.financial_app_close_month(date,text) from anon, public;
revoke all on function public.financial_app_reopen_month(date) from anon, public;
revoke all on function public.financial_app_movements_advanced_v14(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) from anon, public;

grant execute on function public.financial_app_control_center(date) to authenticated;
grant execute on function public.financial_app_set_control_alert_state(text,text,integer,text) to authenticated;
grant execute on function public.financial_app_close_month(date,text) to authenticated;
grant execute on function public.financial_app_reopen_month(date) to authenticated;
grant execute on function public.financial_app_movements_advanced_v14(integer,integer,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,date,date,numeric,numeric,text,text,boolean,boolean) to authenticated;
