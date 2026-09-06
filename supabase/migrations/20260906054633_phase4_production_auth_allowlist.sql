create table if not exists financial_app.authorized_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table financial_app.authorized_users from public, anon, authenticated;
grant select, insert, update, delete on table financial_app.authorized_users to service_role;

create or replace function public.financial_app_is_authorized()
returns boolean
language sql
stable
security definer
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

comment on table financial_app.authorized_users is 'Explicit allowlist for authenticated access to the private Financial App UI and APIs.';
comment on function public.financial_app_is_authorized() is 'Returns true only when the current authenticated Supabase user is active in the Financial App allowlist.';
