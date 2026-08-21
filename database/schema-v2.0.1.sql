-- Finanzas 3.0 V2.0.1
-- Snapshot reproducible del esquema finance_v3_* observado en Supabase.
-- No ejecutar sobre producción existente como migración incremental.

create extension if not exists pgcrypto;

create table public.finance_v3_audit (
  id bigint generated always as identity primary key,
  action text not null,
  entity_type text not null,
  entity_key text,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default now()
);

create table public.finance_v3_current (
  id text primary key default 'banking-source',
  source_file_id text not null,
  source_name text not null,
  source_modified_at timestamptz,
  sheet_name text not null,
  row_count integer not null default 0,
  content_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_v3_snapshots (
  id bigint generated always as identity primary key,
  source_file_id text not null,
  source_name text not null,
  source_modified_at timestamptz,
  sheet_name text not null,
  row_count integer not null default 0,
  content_hash text not null,
  payload jsonb not null,
  captured_at timestamptz not null default now()
);

create table public.finance_v3_movement_overrides (
  source_id text primary key,
  category text,
  subcategory text,
  merchant text,
  notes text,
  tags text[] not null default '{}',
  review_status text not null default 'pending' check (review_status = any(array['pending','reviewed','ignored'])),
  reconciled boolean not null default false,
  excluded_from_analytics boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_v3_budgets (
  year_month text not null check (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  category text not null,
  assigned numeric not null default 0,
  rollover boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (year_month, category)
);

create table public.finance_v3_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_amount numeric not null check (target_amount >= 0),
  current_amount numeric not null default 0 check (current_amount >= 0),
  target_date date,
  monthly_contribution numeric check (monthly_contribution is null or monthly_contribution >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_v3_future_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  expected_date date not null,
  amount numeric not null check (amount <> 0),
  category text,
  account text,
  recurrence text not null default 'once' check (recurrence = any(array['once','monthly','yearly'])),
  recurrence_end date check (recurrence_end is null or recurrence_end >= expected_date),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_v3_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 180),
  income_change_pct numeric not null default 0 check (income_change_pct between -100 and 1000),
  expense_change_pct numeric not null default 0 check (expense_change_pct between -100 and 1000),
  monthly_net_adjustment numeric not null default 0,
  monthly_savings_allocation numeric not null default 0 check (monthly_savings_allocation >= 0),
  starting_balance_adjustment numeric not null default 0,
  horizon_months integer not null default 12 check (horizon_months between 1 and 60),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_v3_recurring_preferences (
  pattern_key text primary key,
  status text not null default 'auto' check (status = any(array['auto','confirmed','ignored'])),
  display_name text,
  expected_amount numeric,
  category text,
  next_expected_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_v3_movement_splits (
  source_id text not null,
  line_no integer not null check (line_no between 1 and 24),
  amount numeric not null check (amount <> 0),
  category text not null check (char_length(trim(category)) between 1 and 120),
  subcategory text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, line_no)
);

create unique index finance_v3_snapshots_hash_uq on public.finance_v3_snapshots(content_hash);
create index finance_v3_snapshots_captured_idx on public.finance_v3_snapshots(captured_at desc);
create index finance_v3_audit_time_idx on public.finance_v3_audit(occurred_at desc);
create index finance_v3_overrides_review_idx on public.finance_v3_movement_overrides(review_status, updated_at desc);
create index finance_v3_budgets_month_idx on public.finance_v3_budgets(year_month);
create index finance_v3_goals_active_idx on public.finance_v3_goals(active, target_date);
create index finance_v3_future_events_date_idx on public.finance_v3_future_events(active, expected_date);
create index finance_v3_scenarios_active_idx on public.finance_v3_scenarios(active, created_at desc);
create index finance_v3_recurring_status_idx on public.finance_v3_recurring_preferences(status, updated_at desc);
create index finance_v3_movement_splits_source_idx on public.finance_v3_movement_splits(source_id);

create or replace function public.finance_v3_touch_updated_at()
returns trigger language plpgsql set search_path to '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.finance_v3_audit_movement_override()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.finance_v3_audit(action, entity_type, entity_key, before_state, after_state)
  values (
    case when tg_op = 'INSERT' then 'create' when tg_op = 'UPDATE' then 'update' else 'delete' end,
    'movement_override', coalesce(new.source_id, old.source_id),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.finance_v3_audit_budget_goal()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_key text; v_entity text;
begin
  if tg_table_name = 'finance_v3_budgets' then
    v_entity := 'budget';
    v_key := coalesce(new.year_month || ':' || new.category, old.year_month || ':' || old.category);
  else
    v_entity := 'goal';
    v_key := coalesce(new.id::text, old.id::text);
  end if;
  insert into public.finance_v3_audit(action, entity_type, entity_key, before_state, after_state)
  values (
    case when tg_op = 'INSERT' then 'create' when tg_op = 'UPDATE' then 'update' else 'delete' end,
    v_entity, v_key,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.finance_v3_audit_planning()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_entity text; v_key text;
begin
  v_entity := case when tg_table_name = 'finance_v3_future_events' then 'future_event' when tg_table_name = 'finance_v3_scenarios' then 'scenario' else tg_table_name end;
  v_key := coalesce(new.id::text, old.id::text);
  insert into public.finance_v3_audit(action, entity_type, entity_key, before_state, after_state)
  values (
    case when tg_op = 'INSERT' then 'create' when tg_op = 'UPDATE' then 'update' else 'delete' end,
    v_entity, v_key,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.finance_v3_audit_recurring_preference()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.finance_v3_audit(action, entity_type, entity_key, before_state, after_state)
  values (
    case when tg_op = 'INSERT' then 'create' when tg_op = 'UPDATE' then 'update' else 'delete' end,
    'recurring_preference', coalesce(new.pattern_key, old.pattern_key),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.finance_v3_audit_movement_split()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.finance_v3_audit(action, entity_type, entity_key, before_state, after_state)
  values (
    lower(tg_op), 'movement_split', coalesce(new.source_id, old.source_id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.finance_v3_delete_movement_splits(p_source_id text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_count integer;
begin
  if p_source_id is null or length(trim(p_source_id)) = 0 then raise exception 'source_id_required'; end if;
  delete from public.finance_v3_movement_splits where source_id = p_source_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.finance_v3_replace_movement_splits(p_source_id text, p_source_amount numeric, p_lines jsonb)
returns setof public.finance_v3_movement_splits language plpgsql security definer set search_path to 'public' as $$
declare
  v_count integer; v_total numeric := 0; v_line jsonb; v_amount numeric;
  v_category text; v_subcategory text; v_notes text; v_index integer := 0;
begin
  if p_source_id is null or length(trim(p_source_id)) = 0 then raise exception 'source_id_required'; end if;
  if p_source_amount is null or p_source_amount = 0 then raise exception 'invalid_source_amount'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'split_lines_must_be_array'; end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 2 or v_count > 12 then raise exception 'split_line_count_out_of_range'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    begin v_amount := (v_line->>'amount')::numeric; exception when others then raise exception 'invalid_split_amount'; end;
    v_category := nullif(trim(v_line->>'category'), '');
    v_subcategory := nullif(trim(v_line->>'subcategory'), '');
    v_notes := nullif(trim(v_line->>'notes'), '');
    if v_amount is null or v_amount = 0 then raise exception 'invalid_split_amount'; end if;
    if sign(v_amount) <> sign(p_source_amount) then raise exception 'split_direction_mismatch'; end if;
    if v_category is null or length(v_category) > 120 then raise exception 'invalid_split_category'; end if;
    if v_subcategory is not null and length(v_subcategory) > 120 then raise exception 'invalid_split_subcategory'; end if;
    if v_notes is not null and length(v_notes) > 1000 then raise exception 'invalid_split_notes'; end if;
    v_total := v_total + v_amount;
  end loop;
  if abs(v_total - p_source_amount) > 0.01 then raise exception 'split_total_mismatch'; end if;
  delete from public.finance_v3_movement_splits where source_id = p_source_id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_index := v_index + 1;
    v_amount := (v_line->>'amount')::numeric;
    v_category := trim(v_line->>'category');
    v_subcategory := nullif(trim(v_line->>'subcategory'), '');
    v_notes := nullif(trim(v_line->>'notes'), '');
    insert into public.finance_v3_movement_splits(source_id,line_no,amount,category,subcategory,notes)
    values (p_source_id,v_index,v_amount,v_category,v_subcategory,v_notes);
  end loop;
  return query select * from public.finance_v3_movement_splits where source_id=p_source_id order by line_no;
end;
$$;

create trigger finance_v3_overrides_touch before update on public.finance_v3_movement_overrides for each row execute function public.finance_v3_touch_updated_at();
create trigger finance_v3_overrides_audit after insert or update or delete on public.finance_v3_movement_overrides for each row execute function public.finance_v3_audit_movement_override();
create trigger finance_v3_budgets_touch before update on public.finance_v3_budgets for each row execute function public.finance_v3_touch_updated_at();
create trigger finance_v3_budgets_audit after insert or update or delete on public.finance_v3_budgets for each row execute function public.finance_v3_audit_budget_goal();
create trigger finance_v3_goals_touch before update on public.finance_v3_goals for each row execute function public.finance_v3_touch_updated_at();
create trigger finance_v3_goals_audit after insert or update or delete on public.finance_v3_goals for each row execute function public.finance_v3_audit_budget_goal();
create trigger finance_v3_future_events_touch before update on public.finance_v3_future_events for each row execute function public.finance_v3_touch_updated_at();
create trigger finance_v3_future_events_audit after insert or update or delete on public.finance_v3_future_events for each row execute function public.finance_v3_audit_planning();
create trigger finance_v3_scenarios_touch before update on public.finance_v3_scenarios for each row execute function public.finance_v3_touch_updated_at();
create trigger finance_v3_scenarios_audit after insert or update or delete on public.finance_v3_scenarios for each row execute function public.finance_v3_audit_planning();
create trigger finance_v3_recurring_touch before update on public.finance_v3_recurring_preferences for each row execute function public.finance_v3_touch_updated_at();
create trigger finance_v3_recurring_audit after insert or update or delete on public.finance_v3_recurring_preferences for each row execute function public.finance_v3_audit_recurring_preference();
create trigger finance_v3_movement_splits_touch before update on public.finance_v3_movement_splits for each row execute function public.finance_v3_touch_updated_at();
create trigger finance_v3_movement_splits_audit after insert or update or delete on public.finance_v3_movement_splits for each row execute function public.finance_v3_audit_movement_split();

alter table public.finance_v3_audit enable row level security;
alter table public.finance_v3_current enable row level security;
alter table public.finance_v3_snapshots enable row level security;
alter table public.finance_v3_movement_overrides enable row level security;
alter table public.finance_v3_budgets enable row level security;
alter table public.finance_v3_goals enable row level security;
alter table public.finance_v3_future_events enable row level security;
alter table public.finance_v3_scenarios enable row level security;
alter table public.finance_v3_recurring_preferences enable row level security;
alter table public.finance_v3_movement_splits enable row level security;

revoke all on table public.finance_v3_audit, public.finance_v3_current, public.finance_v3_snapshots, public.finance_v3_movement_overrides, public.finance_v3_budgets, public.finance_v3_goals, public.finance_v3_future_events, public.finance_v3_scenarios, public.finance_v3_recurring_preferences, public.finance_v3_movement_splits from anon, authenticated;
grant all on table public.finance_v3_audit, public.finance_v3_current, public.finance_v3_snapshots, public.finance_v3_movement_overrides, public.finance_v3_budgets, public.finance_v3_goals, public.finance_v3_future_events, public.finance_v3_scenarios, public.finance_v3_recurring_preferences, public.finance_v3_movement_splits to service_role;
grant usage, select on sequence public.finance_v3_audit_id_seq, public.finance_v3_snapshots_id_seq to service_role;

revoke all on function public.finance_v3_audit_movement_override(), public.finance_v3_audit_budget_goal(), public.finance_v3_audit_planning(), public.finance_v3_audit_recurring_preference(), public.finance_v3_audit_movement_split(), public.finance_v3_delete_movement_splits(text), public.finance_v3_replace_movement_splits(text,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.finance_v3_audit_movement_override(), public.finance_v3_audit_budget_goal(), public.finance_v3_audit_planning(), public.finance_v3_audit_recurring_preference(), public.finance_v3_audit_movement_split(), public.finance_v3_delete_movement_splits(text), public.finance_v3_replace_movement_splits(text,numeric,jsonb) to service_role;
