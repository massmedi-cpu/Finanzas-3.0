begin;

-- Financial App 6.4.0 — endurecimiento de exposición RPC.
-- Los wrappers públicos vuelven a SECURITY INVOKER. Los cores permanecen SECURITY DEFINER,
-- fuera del esquema API público, y comprueban authorized_email() antes de leer o escribir.

alter function public.financial_app_document_operations(integer) security invoker;
alter function public.financial_app_document_operation(uuid,text,text) security invoker;
alter function public.financial_app_document_operations_batch(jsonb) security invoker;

grant usage on schema financial_app to authenticated;
grant execute on function financial_app.document_operations_core(integer) to authenticated;
grant execute on function financial_app.document_operation_core(uuid,text,text) to authenticated;
grant execute on function financial_app.document_operations_batch_core(jsonb) to authenticated;

revoke all on function public.financial_app_document_operations(integer) from anon;
revoke all on function public.financial_app_document_operation(uuid,text,text) from anon;
revoke all on function public.financial_app_document_operations_batch(jsonb) from anon;
revoke all on function financial_app.document_operations_core(integer) from anon;
revoke all on function financial_app.document_operation_core(uuid,text,text) from anon;
revoke all on function financial_app.document_operations_batch_core(jsonb) from anon;

commit;
