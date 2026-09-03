begin;

-- Financial App 9.0.0 · bounded actual-matching window
-- forecast_calendar_visible_core already knows every event's exact acceptable
-- date interval (estimatedDate ± toleranceDays). Limit transaction preparation
-- to the union envelope of those intervals before forecast_norm/identity work.
-- Matching rules, tolerances, ranking and one-to-one semantics remain unchanged.

do $migration$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef('financial_app.forecast_calendar_visible_core(date,integer)'::regprocedure) into v_def;
  if v_def is null then raise exception 'forecast_match_window_missing_visible_core'; end if;

  if position('boundedActualMatchingWindow' in v_def)>0 then
    return;
  end if;

  v_next:=replace(v_def,$old$
  ),transaction_base as(
$old$,$new$
  ),event_window as(
    select min(estimated_date-tolerance_days) min_date,
      least(current_date,max(estimated_date+tolerance_days)) max_date
    from events
  ),transaction_base as(
$new$);
  if v_next=v_def then raise exception 'forecast_match_window_event_window_patch_not_applied'; end if;
  v_def:=v_next;

  v_next:=replace(v_def,$old$
    from financial_app.transactions t
    join financial_app.accounts a on a.id=t.account_id
    where a.account_role='operating'
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.effective_date,t.source_date)<=current_date
  ),candidate_base as(
$old$,$new$
    from financial_app.transactions t
    join financial_app.accounts a on a.id=t.account_id
    cross join event_window w
    where a.account_role='operating'
      and t.source_missing=false and t.is_duplicate=false and t.is_internal_transfer=false
      and coalesce(t.effective_date,t.source_date) between w.min_date and w.max_date
  ),candidate_base as(
$new$);
  if v_next=v_def then raise exception 'forecast_match_window_transaction_range_patch_not_applied'; end if;
  v_def:=v_next;

  v_next:=replace(v_def,
    $old$      'oneToOneActualMatching',true,$old$,
    $new$      'oneToOneActualMatching',true,
      'boundedActualMatchingWindow',true,$new$);
  if v_next=v_def then raise exception 'forecast_match_window_rule_patch_not_applied'; end if;
  v_def:=v_next;

  execute v_def;
end
$migration$;

comment on function financial_app.forecast_calendar_visible_core(date,integer) is
  'Canonical visible forecast calendar. One-to-one actual matching prepares transactions only inside the events physical tolerance envelope; identity, amount and ranking semantics are unchanged.';

commit;
