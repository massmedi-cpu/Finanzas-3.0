-- Financial App 10.0.86 · endurecimiento RLS de etiquetas generales
-- La tabla solo contiene metadatos de usuario; la fuente bancaria sigue siendo inmutable.

alter table financial_app.transaction_tags enable row level security;
alter table financial_app.transaction_tags force row level security;

drop policy if exists transaction_tags_workspace_isolation on financial_app.transaction_tags;
create policy transaction_tags_workspace_isolation
on financial_app.transaction_tags
for all
to financial_app_gateway
using (
  exists (
    select 1
    from financial_app.transactions t
    where t.id = transaction_tags.transaction_id
      and t.workspace_id = financial_app.require_current_workspace_id()
  )
)
with check (
  exists (
    select 1
    from financial_app.transactions t
    where t.id = transaction_tags.transaction_id
      and t.workspace_id = financial_app.require_current_workspace_id()
  )
);

revoke all on financial_app.transaction_tags from public, anon, authenticated;
grant select, insert, update, delete on financial_app.transaction_tags to financial_app_gateway;
grant select, insert, update, delete on financial_app.transaction_tags to service_role;

comment on table financial_app.transaction_tags is
'Axioma §22 10.0.86: etiquetas de usuario aisladas por workspace y separadas de la fuente bancaria.';
