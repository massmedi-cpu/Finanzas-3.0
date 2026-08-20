-- Reference schema for V1.5.0 recurring preferences.
-- Production migration is applied through Supabase migration tooling.

create table if not exists public.finance_v3_recurring_preferences (
  pattern_key text primary key,
  status text not null default 'auto' check (status in ('auto', 'confirmed', 'ignored')),
  display_name text,
  expected_amount numeric,
  category text,
  next_expected_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_v3_recurring_preferences enable row level security;
