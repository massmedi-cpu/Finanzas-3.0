grant usage on schema financial_app to authenticated;

alter table financial_app.authorized_users enable row level security;

drop policy if exists authorized_users_select_self on financial_app.authorized_users;
create policy authorized_users_select_self
on financial_app.authorized_users
for select
to authenticated
using (user_id = auth.uid());

revoke all on table financial_app.authorized_users from authenticated;
grant select (user_id, active) on table financial_app.authorized_users to authenticated;

create or replace function public.financial_app_is_authorized()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from financial_app.authorized_users as authorized
    where authorized.user_id = auth.uid()
      and authorized.active = true
  );
$$;

revoke all on function public.financial_app_is_authorized() from public, anon;
grant execute on function public.financial_app_is_authorized() to authenticated;
grant execute on function public.financial_app_is_authorized() to service_role;

comment on function public.financial_app_is_authorized() is 'Returns true only when the current authenticated Supabase user can see an active self-row in the Financial App allowlist.';
