begin;

create or replace function financial_app.effective_reconciliation_status(t financial_app.transactions)
returns text language sql immutable security invoker
as $function$
  select case
    when t.is_reconciled is true then 'reconciled'
    when t.is_reconciled is false then 'not_reconciled'
    when lower(trim(coalesce(t.source_reconciled,''))) in ('sí','si','yes','true','1') then 'reconciled'
    when lower(trim(coalesce(t.source_reconciled,'')))='no aplica' then 'not_applicable'
    when lower(trim(coalesce(t.source_reconciled,'')))='pendiente' then 'pending'
    when lower(trim(coalesce(t.source_reconciled,''))) in ('no','false','0') then 'not_reconciled'
    else 'pending'
  end
$function$;

create or replace function financial_app.reconciliation_summary_core()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare v_email text:=financial_app.authorized_email();v_summary jsonb;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501';end if;
  with statuses as materialized(
    select financial_app.effective_reconciliation_status(t) status from financial_app.transactions t
  )
  select jsonb_build_object(
    'total',count(*),
    'reconciled',count(*) filter(where status='reconciled'),
    'pending',count(*) filter(where status='pending'),
    'notReconciled',count(*) filter(where status='not_reconciled'),
    'notApplicable',count(*) filter(where status='not_applicable')
  ) into v_summary from statuses;
  return v_summary;
end
$function$;

create or replace function financial_app.reconciliation_overview_core()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $function$
declare v_email text;v_summary jsonb;v_pairs jsonb;v_groups jsonb;v_methods jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501';end if;

  with statuses as materialized(
    select t.*,financial_app.effective_reconciliation_status(t) reconciliation_status
    from financial_app.transactions t
  ),summary as(
    select jsonb_build_object(
      'total',count(*),
      'reconciled',count(*) filter(where reconciliation_status='reconciled'),
      'pending',count(*) filter(where reconciliation_status='pending'),
      'notReconciled',count(*) filter(where reconciliation_status='not_reconciled'),
      'notApplicable',count(*) filter(where reconciliation_status='not_applicable')
    ) j from statuses
  ),groups_json as(
    select coalesce(jsonb_agg(jsonb_build_object(
      'identifier',g.source_identifier,'account',g.source_account,'subcategory',g.subcategory,
      'status',g.status,'count',g.n,'firstDate',g.first_date,'lastDate',g.last_date,'grossAmount',g.gross_amount
    ) order by g.status,g.n desc,g.source_identifier,g.subcategory),'[]'::jsonb) j
    from(
      select source_identifier,source_account,coalesce(source_subcategory,'Sin subcategoría') subcategory,
        reconciliation_status status,count(*) n,
        min(coalesce(effective_date,source_date)) first_date,
        max(coalesce(effective_date,source_date)) last_date,
        sum(abs(coalesce(source_amount,0))) gross_amount
      from statuses
      where reconciliation_status in ('pending','not_reconciled')
      group by source_identifier,source_account,coalesce(source_subcategory,'Sin subcategoría'),reconciliation_status
    ) g
  )
  select summary.j,groups_json.j into v_summary,v_groups from summary cross join groups_json;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'a',a.source_id,'b',b.source_id,'amount',abs(a.source_amount),
    'dateA',coalesce(a.effective_date,a.source_date),'dateB',coalesce(b.effective_date,b.source_date),
    'accountA',a.source_account,'accountB',b.source_account,
    'identifierA',a.source_identifier,'identifierB',b.source_identifier,
    'method',p.method,'confidence',p.confidence,'reason',p.reason,'createdAt',p.created_at
  ) order by p.created_at desc),'[]'::jsonb)
  into v_pairs
  from financial_app.reconciliation_pairs p
  join financial_app.transactions a on a.id=p.transaction_a_id
  join financial_app.transactions b on b.id=p.transaction_b_id
  where p.status='matched';

  select coalesce(jsonb_agg(jsonb_build_object('method',x.method,'count',x.n) order by x.n desc,x.method),'[]'::jsonb)
  into v_methods
  from(select method,count(*) n from financial_app.reconciliation_pairs where status='matched' group by method) x;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),
    'summary',v_summary,'pairs',v_pairs,'unresolvedGroups',v_groups,'methods',v_methods
  );
end
$function$;

revoke execute on function financial_app.reconciliation_summary_core() from public,anon,authenticated;
grant execute on function financial_app.reconciliation_summary_core() to service_role;

commit;
