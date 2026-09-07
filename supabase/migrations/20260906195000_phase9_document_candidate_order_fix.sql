-- F9 · Corrección acumulativa del orden de candidatos documentales.
create or replace function financial_app.document_transaction_candidates(
  p_document_id uuid,
  p_days integer default 7,
  p_limit integer default 8
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document financial_app.documents%rowtype;
  v_candidates jsonb;
  v_tolerance bigint;
begin
  if p_days < 0 or p_days > 31 then raise exception 'invalid_document_candidate_days'; end if;
  if p_limit < 1 or p_limit > 20 then raise exception 'invalid_document_candidate_limit'; end if;
  select * into v_document from financial_app.documents where id=p_document_id;
  if not found then raise exception 'document_not_found'; end if;

  if v_document.document_date is null or v_document.total_cents is null then
    return jsonb_build_object(
      'contractVersion',1,
      'documentId',p_document_id,
      'ready',false,
      'reason','metadata_required',
      'candidates','[]'::jsonb,
      'principles',jsonb_build_object('bankSource','read_only','suggestionsPersisted',false,'requiresConfirmation',true)
    );
  end if;

  v_tolerance := greatest(200::bigint, ceil(abs(v_document.total_cents)::numeric * 0.03)::bigint);

  with ranked as (
    select
      f.transaction_id,
      f.bank_date,
      f.amount_cents,
      t.concept_normalized,
      t.account_id,
      ac.name as account_name,
      f.effective_merchant_id,
      m.name as merchant_name,
      f.effective_category_id,
      f.effective_kind,
      abs(f.bank_date - v_document.document_date)::int as day_difference,
      abs(abs(f.amount_cents) - abs(v_document.total_cents))::bigint as amount_difference,
      greatest(0::numeric, least(1::numeric,
        1::numeric
        - (abs(f.bank_date - v_document.document_date)::numeric / greatest(p_days + 1,1)::numeric) * 0.35
        - (abs(abs(f.amount_cents) - abs(v_document.total_cents))::numeric / greatest(abs(v_document.total_cents),1)::numeric) * 2
      )) as confidence
    from financial_app.financial_transaction_facts(
      v_document.document_date - p_days,
      v_document.document_date + p_days,
      null
    ) f
    join financial_app.transactions t on t.id=f.transaction_id
    join financial_app.accounts ac on ac.id=t.account_id
    left join financial_app.merchants m on m.id=f.effective_merchant_id
    where f.analytics_eligible=true
      and f.effective_kind in ('expense','income')
      and abs(abs(f.amount_cents) - abs(v_document.total_cents)) <= v_tolerance
      and not exists (
        select 1 from financial_app.document_transaction_associations a
        where a.document_id=p_document_id and a.transaction_id=f.transaction_id and a.confirmed=true
      )
    order by amount_difference asc, day_difference asc, f.bank_date desc, f.transaction_id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'transactionId',transaction_id,
    'date',bank_date,
    'amountCents',amount_cents,
    'concept',concept_normalized,
    'accountId',account_id,
    'accountName',account_name,
    'merchantId',effective_merchant_id,
    'merchantName',merchant_name,
    'categoryId',effective_category_id,
    'effectiveKind',effective_kind,
    'dayDifference',day_difference,
    'amountDifferenceCents',amount_difference,
    'confidence',round(confidence,4)
  ) order by amount_difference,day_difference,bank_date desc), '[]'::jsonb)
  into v_candidates from ranked;

  return jsonb_build_object(
    'contractVersion',1,
    'documentId',p_document_id,
    'ready',true,
    'reason',null,
    'days',p_days,
    'amountToleranceCents',v_tolerance,
    'candidates',v_candidates,
    'principles',jsonb_build_object('bankSource','read_only','suggestionsPersisted',false,'requiresConfirmation',true)
  );
end;
$$;

revoke all on function financial_app.document_transaction_candidates(uuid,integer,integer) from public, anon, authenticated;
grant execute on function financial_app.document_transaction_candidates(uuid,integer,integer) to service_role;
