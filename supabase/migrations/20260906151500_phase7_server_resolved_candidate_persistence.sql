begin;

create or replace function financial_app.save_recurrence_candidate(
  p_candidate_key text,
  p_status text,
  p_date_from date default null,
  p_date_to date default null,
  p_min_occurrences integer default 3
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_candidate_key text := lower(btrim(coalesce(p_candidate_key, '')));
  v_snapshot jsonb;
  v_candidate jsonb;
begin
  if v_candidate_key !~ '^[0-9a-f]{32}$' then
    raise exception 'invalid_recurrence_candidate_key';
  end if;
  if p_status not in ('active','ignored','archived') then
    raise exception 'invalid_recurrence_status';
  end if;

  v_snapshot := financial_app.recurrence_candidate_snapshot(
    p_date_from,
    p_date_to,
    p_min_occurrences
  );

  select candidate
  into v_candidate
  from jsonb_array_elements(coalesce(v_snapshot->'candidates', '[]'::jsonb)) candidate
  where candidate->>'candidateKey' = v_candidate_key
  limit 1;

  if v_candidate is null then
    raise exception 'recurrence_candidate_not_found';
  end if;

  return financial_app.save_recurrence(
    nullif(v_candidate->>'existingRecurrenceId', '')::uuid,
    nullif(v_candidate->>'accountId', '')::uuid,
    nullif(v_candidate->>'merchantId', '')::uuid,
    nullif(v_candidate->>'categoryId', '')::uuid,
    v_candidate->>'conceptPattern',
    p_status,
    v_candidate->>'intervalUnit',
    (v_candidate->>'intervalCount')::integer,
    (v_candidate->>'usualAmountCents')::bigint,
    (v_candidate->>'amountToleranceCents')::bigint,
    (v_candidate->>'dateToleranceDays')::integer,
    nullif(v_candidate->>'nextEstimatedDate', '')::date,
    v_candidate->>'confidence',
    (v_candidate->>'occurrenceCount')::integer,
    nullif(v_candidate->>'lastObservedDate', '')::date
  );
end;
$$;

revoke all on function financial_app.save_recurrence_candidate(text,text,date,date,integer)
  from public, anon, authenticated;
grant execute on function financial_app.save_recurrence_candidate(text,text,date,date,integer)
  to service_role;

commit;
