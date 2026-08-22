-- Financial App 1.0.0-rc.1
-- Corrección de regresión detectada en Preview: los wrappers públicos de Objetivos
-- podían ejecutarse como authenticated, pero sus funciones core no concedían EXECUTE.
-- Se mantiene anon fuera y se habilita únicamente authenticated/service_role.

revoke all on function financial_app.goals_overview_core() from public, anon;
revoke all on function financial_app.upsert_goal_core(uuid,text,text,numeric,text,numeric,uuid,date,text,text) from public, anon;
revoke all on function financial_app.deactivate_goal_core(uuid) from public, anon;

grant usage on schema financial_app to authenticated, service_role;
grant execute on function financial_app.goals_overview_core() to authenticated, service_role;
grant execute on function financial_app.upsert_goal_core(uuid,text,text,numeric,text,numeric,uuid,date,text,text) to authenticated, service_role;
grant execute on function financial_app.deactivate_goal_core(uuid) to authenticated, service_role;
