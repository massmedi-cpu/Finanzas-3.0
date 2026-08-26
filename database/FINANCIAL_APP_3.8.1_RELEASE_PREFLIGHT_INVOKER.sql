begin;

-- Financial App 3.8.1 — release preflight without privilege escalation.
-- Public surface contains only technical release metadata, never financial data.

create table if not exists public.financial_app_release_manifest (
  singleton boolean primary key default true check (singleton),
  app_version text not null check (app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  target_version text not null check (target_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  updated_at timestamptz not null default now()
);

alter table public.financial_app_release_manifest enable row level security;
revoke all on table public.financial_app_release_manifest from public, anon, authenticated;
grant select on table public.financial_app_release_manifest to anon, authenticated, service_role;

drop policy if exists financial_app_release_manifest_read on public.financial_app_release_manifest;
create policy financial_app_release_manifest_read
on public.financial_app_release_manifest
for select
to anon, authenticated
using (true);

insert into public.financial_app_release_manifest(singleton,app_version,target_version,updated_at)
select
  true,
  coalesce((select value #>> '{}' from financial_app.app_meta where key='app_version'),'0.0.0'),
  coalesce((select value #>> '{}' from financial_app.app_meta where key='target_version'),'0.0.0'),
  now()
on conflict(singleton) do update
set app_version=excluded.app_version,
    target_version=excluded.target_version,
    updated_at=excluded.updated_at;

create or replace function financial_app.sync_release_manifest_core()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, financial_app, public
as $$
declare
  v_app_version text;
  v_target_version text;
begin
  select value #>> '{}' into v_app_version from financial_app.app_meta where key='app_version';
  select value #>> '{}' into v_target_version from financial_app.app_meta where key='target_version';

  if v_app_version is not null and v_target_version is not null then
    insert into public.financial_app_release_manifest(singleton,app_version,target_version,updated_at)
    values(true,v_app_version,v_target_version,now())
    on conflict(singleton) do update
    set app_version=excluded.app_version,
        target_version=excluded.target_version,
        updated_at=excluded.updated_at;
  end if;
  return new;
end
$$;

revoke all on function financial_app.sync_release_manifest_core() from public, anon, authenticated;

drop trigger if exists financial_app_sync_release_manifest on financial_app.app_meta;
create trigger financial_app_sync_release_manifest
after insert or update of value on financial_app.app_meta
for each row
when (new.key in ('app_version','target_version'))
execute function financial_app.sync_release_manifest_core();

create or replace function public.financial_app_release_preflight(
  p_expected_version text,
  p_required_functions text[] default array[]::text[]
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_app_version text;
  v_target_version text;
  v_required text[];
  v_missing text[];
begin
  if p_expected_version is null or p_expected_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
    return jsonb_build_object('ok',false,'error','invalid_expected_version');
  end if;

  select coalesce(array_agg(distinct lower(trim(value)) order by lower(trim(value))),array[]::text[])
  into v_required
  from unnest(coalesce(p_required_functions,array[]::text[])) value
  where nullif(trim(value),'') is not null;

  if cardinality(v_required)>200 then
    return jsonb_build_object('ok',false,'error','required_function_limit_exceeded');
  end if;

  if exists(
    select 1 from unnest(v_required) value
    where value !~ '^financial_app_[a-z0-9_]+$'
  ) then
    return jsonb_build_object('ok',false,'error','invalid_required_function');
  end if;

  select app_version,target_version
  into v_app_version,v_target_version
  from public.financial_app_release_manifest
  where singleton=true;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_missing
  from unnest(v_required) value
  where not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=value
  );

  return jsonb_build_object(
    'ok',v_app_version=p_expected_version and v_target_version=p_expected_version and cardinality(v_missing)=0,
    'appVersion',v_app_version,
    'targetVersion',v_target_version,
    'expectedVersion',p_expected_version,
    'requiredCount',cardinality(v_required),
    'missing',to_jsonb(v_missing)
  );
end
$$;

revoke all on function public.financial_app_release_preflight(text,text[]) from public;
grant execute on function public.financial_app_release_preflight(text,text[]) to anon, authenticated, service_role;

commit;
