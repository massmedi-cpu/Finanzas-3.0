-- Financial App 1.8.0 · recuperación privada segura y transaccional

create table if not exists financial_app.private_backup_checkpoints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null,
  reason text not null,
  payload_fingerprint text not null,
  payload jsonb not null
);
alter table financial_app.private_backup_checkpoints enable row level security;
revoke all on table financial_app.private_backup_checkpoints from public, anon, authenticated;
grant select, insert, delete on table financial_app.private_backup_checkpoints to service_role;
create index if not exists private_backup_checkpoints_created_at_idx
  on financial_app.private_backup_checkpoints(created_at desc);

create or replace function financial_app.backup_array(p_backup jsonb, p_key text)
returns jsonb
language sql immutable
set search_path='pg_catalog'
as $$
  select case when jsonb_typeof(p_backup -> p_key)='array' then p_backup -> p_key else '[]'::jsonb end
$$;
revoke all on function financial_app.backup_array(jsonb,text) from public,anon,authenticated;

create or replace function financial_app.source_guard_core()
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_anchors jsonb;
  v_count bigint;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select count(*),
         coalesce(jsonb_agg(
           jsonb_build_object(
             'sourceId',t.source_id,
             'sourceHash',coalesce(t.source_hash,''),
             'sourceMissing',t.source_missing
           ) order by t.source_id
         ),'[]'::jsonb)
    into v_count,v_anchors
  from financial_app.transactions t
  where t.source_id is not null;
  return jsonb_build_object('count',v_count,'anchors',v_anchors);
end
$$;
revoke all on function financial_app.source_guard_core() from public,anon,authenticated;
grant execute on function financial_app.source_guard_core() to service_role;

create or replace function financial_app.portable_backup_core()
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_source jsonb;
  v_guard jsonb;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  select value into v_source from financial_app.app_meta where key='source';
  v_guard:=financial_app.source_guard_core();
  return jsonb_build_object(
    'format','financial-app-private-backup',
    'formatVersion',2,
    'appVersion',financial_app.current_app_version(),
    'createdAt',now(),
    'sourceFileId',v_source->>'file_id',
    'sourceTransactionCount',coalesce((v_guard->>'count')::bigint,0),
    'sourceAnchors',coalesce(v_guard->'anchors','[]'::jsonb),
    'transactionOverrides',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceId',source_id,
        'categoryOverride',category_override,
        'subcategoryOverride',subcategory_override,
        'typeOverride',type_override,
        'normalizedConceptOverride',normalized_concept_override,
        'counterpartyOverride',counterparty_override,
        'descriptionOverride',description_override,
        'effectiveDate',effective_date,
        'cashFlowOverride',cash_flow_override,
        'isInternalTransfer',is_internal_transfer,
        'isDuplicate',is_duplicate,
        'isReconciled',is_reconciled,
        'needsReview',needs_review,
        'isRecurring',is_recurring,
        'tags',tags,
        'notes',notes,
        'personalAmountOverride',personal_amount_override
      ) order by source_id)
      from financial_app.transactions
      where category_override is not null
         or subcategory_override is not null
         or type_override is not null
         or normalized_concept_override is not null
         or counterparty_override is not null
         or description_override is not null
         or effective_date is not null
         or cash_flow_override is not null
         or is_internal_transfer
         or is_duplicate
         or is_reconciled is not null
         or needs_review
         or is_recurring is not null
         or cardinality(tags)>0
         or notes is not null
         or personal_amount_override is not null
    ),'[]'::jsonb),
    'splits',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from financial_app.transaction_splits x),'[]'::jsonb),
    'budgets',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from financial_app.budgets x),'[]'::jsonb),
    'forecasts',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from financial_app.forecasts x),'[]'::jsonb),
    'forecastOccurrences',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from financial_app.forecast_occurrences x),'[]'::jsonb),
    'netWorthItems',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from financial_app.net_worth_items x),'[]'::jsonb),
    'goals',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from financial_app.goals x),'[]'::jsonb),
    'rules',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from financial_app.transaction_rules x),'[]'::jsonb),
    'reconciliationPairs',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from financial_app.reconciliation_pairs x),'[]'::jsonb),
    'preferences',coalesce((select jsonb_agg(to_jsonb(x)) from financial_app.preferences x where lower(x.user_email)=v_email),'[]'::jsonb),
    'controlAlertStates',coalesce((select jsonb_agg(to_jsonb(x) order by x.alert_key) from financial_app.control_alert_states x),'[]'::jsonb),
    'monthCloses',coalesce((select jsonb_agg(to_jsonb(x) order by x.month_start,x.id) from financial_app.month_closes x),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(x)-'ocr_text' order by x.created_at,x.id) from financial_app.documents x),'[]'::jsonb),
    'transactionDocuments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.transaction_id,x.document_id) from financial_app.transaction_documents x),'[]'::jsonb),
    'audit',jsonb_build_object(
      'transactionHistoryRows',(select count(*) from financial_app.transaction_history),
      'ruleHistoryRows',(select count(*) from financial_app.transaction_rule_history),
      'budgetHistoryRows',(select count(*) from financial_app.budget_history),
      'forecastHistoryRows',(select count(*) from financial_app.forecast_history),
      'goalHistoryRows',(select count(*) from financial_app.goal_history),
      'netWorthHistoryRows',(select count(*) from financial_app.net_worth_history),
      'documentHistoryRows',(select count(*) from financial_app.document_history)
    )
  );
end
$$;

create or replace function financial_app.validate_portable_backup_core(p_backup jsonb)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_source jsonb;
  v_version int;
  v_errors text[]:=array[]::text[];
  v_warnings text[]:=array[]::text[];
  v_base_sections text[]:=array['transactionOverrides','splits','budgets','forecasts','netWorthItems','goals','rules','reconciliationPairs','preferences','controlAlertStates','monthCloses','documents','transactionDocuments'];
  v_id_sections text[]:=array['splits','budgets','forecasts','netWorthItems','goals','rules','reconciliationPairs','monthCloses','documents'];
  v_key text;
  v_bad bigint;
  v_duplicate bigint:=0;
  v_invalid_refs bigint:=0;
  v_invalid_anchors bigint:=0;
  v_current_source_count bigint:=0;
  v_backup_source_count bigint:=0;
  v_source_matches boolean:=false;
  v_source_file_matches boolean:=false;
  v_ok boolean:=false;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  if p_backup is null or jsonb_typeof(p_backup) is distinct from 'object' then
    return jsonb_build_object(
      'ok',false,'restoreSafe',false,'errors',jsonb_build_array('invalid_backup_object'),
      'warnings','[]'::jsonb,'formatVersion',null,'backupAppVersion',null,
      'currentAppVersion',financial_app.current_app_version()
    );
  end if;

  if coalesce(p_backup->>'format','')<>'financial-app-private-backup' then
    v_errors:=array_append(v_errors,'invalid_format');
  end if;
  begin
    v_version:=nullif(p_backup->>'formatVersion','')::int;
  exception when others then
    v_version:=null;
  end;
  if v_version is null or v_version not in (1,2) then
    v_errors:=array_append(v_errors,'unsupported_format_version');
  end if;

  foreach v_key in array v_base_sections loop
    if jsonb_typeof(p_backup->v_key) is distinct from 'array' then
      v_errors:=array_append(v_errors,'invalid_section:'||v_key);
    else
      select count(*) into v_bad
      from jsonb_array_elements(p_backup->v_key) e(value)
      where jsonb_typeof(value) is distinct from 'object';
      if v_bad>0 then
        v_errors:=array_append(v_errors,'invalid_rows:'||v_key);
      end if;
    end if;
  end loop;

  if v_version=2 then
    if jsonb_typeof(p_backup->'forecastOccurrences') is distinct from 'array' then
      v_errors:=array_append(v_errors,'invalid_section:forecastOccurrences');
    end if;
    if jsonb_typeof(p_backup->'sourceAnchors') is distinct from 'array' then
      v_errors:=array_append(v_errors,'invalid_source_anchors');
    end if;
  elsif v_version=1 then
    v_warnings:=array_append(v_warnings,'legacy_backup_requires_1_8_reexport_for_restore');
  end if;

  select value into v_source from financial_app.app_meta where key='source';
  v_source_file_matches:=coalesce(p_backup->>'sourceFileId','')=coalesce(v_source->>'file_id','');
  if not v_source_file_matches then
    v_errors:=array_append(v_errors,'source_file_mismatch');
  end if;

  foreach v_key in array v_id_sections loop
    select count(*)-count(distinct e.value->>'id') into v_bad
    from jsonb_array_elements(financial_app.backup_array(p_backup,v_key)) e(value);
    v_duplicate:=v_duplicate+coalesce(v_bad,0);
  end loop;
  if v_version=2 then
    select count(*)-count(distinct e.value->>'id') into v_bad
    from jsonb_array_elements(financial_app.backup_array(p_backup,'forecastOccurrences')) e(value);
    v_duplicate:=v_duplicate+coalesce(v_bad,0);
  end if;
  select count(*)-count(distinct e.value->>'sourceId') into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'transactionOverrides')) e(value);
  v_duplicate:=v_duplicate+coalesce(v_bad,0);
  select count(*)-count(distinct e.value->>'alert_key') into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'controlAlertStates')) e(value);
  v_duplicate:=v_duplicate+coalesce(v_bad,0);
  select count(*)-count(distinct e.value->>'user_email') into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'preferences')) e(value);
  v_duplicate:=v_duplicate+coalesce(v_bad,0);
  select count(*)-count(distinct concat_ws('|',e.value->>'transaction_id',e.value->>'document_id')) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'transactionDocuments')) e(value);
  v_duplicate:=v_duplicate+coalesce(v_bad,0);
  if v_duplicate>0 then
    v_errors:=array_append(v_errors,'duplicate_keys:'||v_duplicate::text);
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'transactionOverrides')) e(value)
  left join financial_app.transactions t on t.source_id=e.value->>'sourceId'
  where t.id is null;
  v_invalid_refs:=v_invalid_refs+v_bad;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'splits')) e(value)
  left join financial_app.transactions t on t.id::text=e.value->>'transaction_id'
  where t.id is null;
  v_invalid_refs:=v_invalid_refs+v_bad;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'forecasts')) e(value)
  left join financial_app.transactions t on t.id::text=e.value->>'matched_transaction_id'
  where nullif(e.value->>'matched_transaction_id','') is not null and t.id is null;
  v_invalid_refs:=v_invalid_refs+v_bad;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'forecasts')) e(value)
  left join financial_app.accounts a on a.id::text=e.value->>'account_id'
  where nullif(e.value->>'account_id','') is not null and a.id is null;
  v_invalid_refs:=v_invalid_refs+v_bad;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'goals')) e(value)
  left join financial_app.accounts a on a.id::text=e.value->>'account_id'
  where nullif(e.value->>'account_id','') is not null and a.id is null;
  v_invalid_refs:=v_invalid_refs+v_bad;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'rules')) e(value)
  left join financial_app.accounts a on a.id::text=e.value->>'match_account_id'
  where nullif(e.value->>'match_account_id','') is not null and a.id is null;
  v_invalid_refs:=v_invalid_refs+v_bad;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'reconciliationPairs')) e(value)
  left join financial_app.transactions ta on ta.id::text=e.value->>'transaction_a_id'
  left join financial_app.transactions tb on tb.id::text=e.value->>'transaction_b_id'
  where ta.id is null or tb.id is null;
  v_invalid_refs:=v_invalid_refs+v_bad;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'transactionDocuments')) e(value)
  left join financial_app.transactions t on t.id::text=e.value->>'transaction_id'
  where t.id is null;
  v_invalid_refs:=v_invalid_refs+v_bad;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'transactionDocuments')) e(value)
  where not exists(
    select 1
    from jsonb_array_elements(financial_app.backup_array(p_backup,'documents')) d(value)
    where d.value->>'id'=e.value->>'document_id'
  );
  v_invalid_refs:=v_invalid_refs+v_bad;

  select count(*) into v_bad
  from jsonb_array_elements(financial_app.backup_array(p_backup,'preferences')) e(value)
  where lower(coalesce(e.value->>'user_email',''))<>v_email;
  v_invalid_refs:=v_invalid_refs+v_bad;

  if v_version=2 then
    select count(*) into v_bad
    from jsonb_array_elements(financial_app.backup_array(p_backup,'forecastOccurrences')) e(value)
    where not exists(
      select 1
      from jsonb_array_elements(financial_app.backup_array(p_backup,'forecasts')) f(value)
      where f.value->>'id'=e.value->>'forecast_id'
    );
    v_invalid_refs:=v_invalid_refs+v_bad;

    select count(*) into v_bad
    from jsonb_array_elements(financial_app.backup_array(p_backup,'forecastOccurrences')) e(value)
    left join financial_app.transactions t on t.id::text=e.value->>'matched_transaction_id'
    where nullif(e.value->>'matched_transaction_id','') is not null and t.id is null;
    v_invalid_refs:=v_invalid_refs+v_bad;
  end if;

  if v_invalid_refs>0 then
    v_errors:=array_append(v_errors,'invalid_references:'||v_invalid_refs::text);
  end if;

  if v_version=2 then
    begin
      v_backup_source_count:=coalesce((p_backup->>'sourceTransactionCount')::bigint,0);
    exception when others then
      v_backup_source_count:=-1;
    end;
    select count(*) into v_current_source_count from financial_app.transactions where source_id is not null;
    if v_backup_source_count<0 then
      v_errors:=array_append(v_errors,'invalid_source_transaction_count');
    elsif v_current_source_count<v_backup_source_count then
      v_errors:=array_append(v_errors,'source_transaction_count_regressed');
    elsif v_current_source_count>v_backup_source_count then
      v_warnings:=array_append(v_warnings,'source_contains_newer_transactions:'||(v_current_source_count-v_backup_source_count)::text);
    end if;

    select count(*) into v_invalid_anchors
    from jsonb_array_elements(financial_app.backup_array(p_backup,'sourceAnchors')) a(value)
    left join financial_app.transactions t on t.source_id=a.value->>'sourceId'
    where jsonb_typeof(a.value) is distinct from 'object'
       or t.id is null
       or coalesce(t.source_hash,'') is distinct from coalesce(a.value->>'sourceHash','')
       or t.source_missing::text is distinct from lower(coalesce(a.value->>'sourceMissing','false'));

    select count(*)-count(distinct a.value->>'sourceId') into v_bad
    from jsonb_array_elements(financial_app.backup_array(p_backup,'sourceAnchors')) a(value);
    v_invalid_anchors:=v_invalid_anchors+coalesce(v_bad,0);

    if v_invalid_anchors>0 then
      v_errors:=array_append(v_errors,'source_anchor_mismatch:'||v_invalid_anchors::text);
    end if;
    v_source_matches:=v_source_file_matches and v_invalid_anchors=0 and v_current_source_count>=v_backup_source_count;
  else
    select count(*) into v_current_source_count from financial_app.transactions where source_id is not null;
    v_source_matches:=v_source_file_matches;
  end if;

  v_ok:=cardinality(v_errors)=0;
  return jsonb_build_object(
    'ok',v_ok,
    'restoreSafe',v_ok and v_version=2,
    'errors',to_jsonb(v_errors),
    'warnings',to_jsonb(v_warnings),
    'formatVersion',v_version,
    'backupAppVersion',p_backup->>'appVersion',
    'currentAppVersion',financial_app.current_app_version(),
    'sourceMatches',v_source_matches,
    'source',jsonb_build_object(
      'fileMatches',v_source_file_matches,
      'backupTransactions',case when v_version=2 then v_backup_source_count else null end,
      'currentTransactions',v_current_source_count,
      'newerTransactions',case when v_version=2 then greatest(v_current_source_count-v_backup_source_count,0) else null end,
      'invalidAnchors',case when v_version=2 then v_invalid_anchors else null end
    ),
    'invalidReferences',v_invalid_refs,
    'duplicateKeys',v_duplicate
  );
end
$$;

create or replace function financial_app.backup_section_diff(p_backup jsonb,p_key text,p_current bigint)
returns jsonb
language sql immutable
set search_path='pg_catalog'
as $$
  select jsonb_build_object(
    'backup',jsonb_array_length(financial_app.backup_array(p_backup,p_key)),
    'current',p_current,
    'delta',jsonb_array_length(financial_app.backup_array(p_backup,p_key))-p_current
  )
$$;
revoke all on function financial_app.backup_section_diff(jsonb,text,bigint) from public,anon,authenticated;

create or replace function financial_app.backup_preview_core(p_backup jsonb)
returns jsonb
language plpgsql stable security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_validation jsonb;
  v_sections jsonb;
  v_overrides bigint;
begin
  v_validation:=financial_app.validate_portable_backup_core(p_backup);
  select count(*) into v_overrides
  from financial_app.transactions
  where category_override is not null
     or subcategory_override is not null
     or type_override is not null
     or normalized_concept_override is not null
     or counterparty_override is not null
     or description_override is not null
     or effective_date is not null
     or cash_flow_override is not null
     or is_internal_transfer
     or is_duplicate
     or is_reconciled is not null
     or needs_review
     or is_recurring is not null
     or cardinality(tags)>0
     or notes is not null
     or personal_amount_override is not null;

  v_sections:=jsonb_build_object(
    'transactionOverrides',financial_app.backup_section_diff(p_backup,'transactionOverrides',v_overrides),
    'splits',financial_app.backup_section_diff(p_backup,'splits',(select count(*) from financial_app.transaction_splits)),
    'budgets',financial_app.backup_section_diff(p_backup,'budgets',(select count(*) from financial_app.budgets)),
    'forecasts',financial_app.backup_section_diff(p_backup,'forecasts',(select count(*) from financial_app.forecasts)),
    'forecastOccurrences',financial_app.backup_section_diff(p_backup,'forecastOccurrences',(select count(*) from financial_app.forecast_occurrences)),
    'netWorthItems',financial_app.backup_section_diff(p_backup,'netWorthItems',(select count(*) from financial_app.net_worth_items)),
    'goals',financial_app.backup_section_diff(p_backup,'goals',(select count(*) from financial_app.goals)),
    'rules',financial_app.backup_section_diff(p_backup,'rules',(select count(*) from financial_app.transaction_rules)),
    'reconciliationPairs',financial_app.backup_section_diff(p_backup,'reconciliationPairs',(select count(*) from financial_app.reconciliation_pairs)),
    'preferences',financial_app.backup_section_diff(p_backup,'preferences',(select count(*) from financial_app.preferences where lower(user_email)=financial_app.authorized_email())),
    'controlAlertStates',financial_app.backup_section_diff(p_backup,'controlAlertStates',(select count(*) from financial_app.control_alert_states)),
    'monthCloses',financial_app.backup_section_diff(p_backup,'monthCloses',(select count(*) from financial_app.month_closes)),
    'documents',financial_app.backup_section_diff(p_backup,'documents',(select count(*) from financial_app.documents)),
    'transactionDocuments',financial_app.backup_section_diff(p_backup,'transactionDocuments',(select count(*) from financial_app.transaction_documents))
  );

  return jsonb_build_object(
    'ok',coalesce((v_validation->>'ok')::boolean,false),
    'safe',coalesce((v_validation->>'restoreSafe')::boolean,false),
    'errors',coalesce(v_validation->'errors','[]'::jsonb),
    'warnings',coalesce(v_validation->'warnings','[]'::jsonb),
    'backupFingerprint',md5(p_backup::text),
    'formatVersion',v_validation->'formatVersion',
    'backupAppVersion',v_validation->'backupAppVersion',
    'currentAppVersion',v_validation->'currentAppVersion',
    'source',v_validation->'source',
    'invalidReferences',v_validation->'invalidReferences',
    'duplicateKeys',v_validation->'duplicateKeys',
    'sections',v_sections,
    'restoreMode','transactional_private_layer',
    'confirmationRequired','RESTAURAR'
  );
end
$$;

create or replace function financial_app.backup_upsert_table_core(
  p_table regclass,
  p_payload jsonb,
  p_conflict_columns text[],
  p_skip_columns text[] default array[]::text[]
)
returns void
language plpgsql security definer
set search_path='pg_catalog','financial_app'
as $$
declare
  v_schema text;
  v_table text;
  v_qualified text;
  v_columns text;
  v_select_columns text;
  v_update_columns text;
  v_conflict text;
  v_sql text;
begin
  select n.nspname,c.relname into v_schema,v_table
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.oid=p_table;

  if v_schema is distinct from 'financial_app'
     or v_table not in ('transaction_splits','budgets','forecasts','forecast_occurrences','net_worth_items','goals','transaction_rules','reconciliation_pairs','preferences','control_alert_states','month_closes','documents','transaction_documents') then
    raise exception 'backup_table_not_allowed';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'array' then
    raise exception 'invalid_backup_table_payload:%',v_table;
  end if;

  v_qualified:=format('%I.%I',v_schema,v_table);
  select string_agg(format('%I',a.attname),',' order by a.attnum),
         string_agg(format('x.%I',a.attname),',' order by a.attnum),
         string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum)
           filter(where not (a.attname=any(p_conflict_columns)) and not (a.attname=any(p_skip_columns)))
    into v_columns,v_select_columns,v_update_columns
  from pg_attribute a
  where a.attrelid=p_table
    and a.attnum>0
    and not a.attisdropped
    and a.attgenerated=''
    and not (a.attname=any(p_skip_columns));

  select string_agg(format('%I',x),',') into v_conflict from unnest(p_conflict_columns)x;
  if v_columns is null or v_conflict is null then raise exception 'invalid_backup_table_definition:%',v_table; end if;

  v_sql:=format(
    'insert into %s (%s) select %s from jsonb_populate_recordset(null::%s,$1) as x on conflict (%s) %s',
    v_qualified,v_columns,v_select_columns,v_qualified,v_conflict,
    case when coalesce(v_update_columns,'')='' then 'do nothing' else 'do update set '||v_update_columns end
  );
  execute v_sql using p_payload;
end
$$;
revoke all on function financial_app.backup_upsert_table_core(regclass,jsonb,text[],text[]) from public,anon,authenticated;
grant execute on function financial_app.backup_upsert_table_core(regclass,jsonb,text[],text[]) to service_role;

create or replace function financial_app.restore_portable_backup_core(
  p_backup jsonb,
  p_expected_fingerprint text,
  p_confirmation text
)
returns jsonb
language plpgsql security definer
set search_path='pg_catalog','financial_app','auth'
as $$
declare
  v_email text;
  v_preview jsonb;
  v_fingerprint text;
  v_checkpoint_payload jsonb;
  v_checkpoint_id uuid;
begin
  v_email:=financial_app.authorized_email();
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_confirmation is distinct from 'RESTAURAR' then raise exception 'restore_confirmation_required' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtext('financial_app:private_restore'));
  lock table financial_app.transactions in share row exclusive mode;

  v_preview:=financial_app.backup_preview_core(p_backup);
  if not coalesce((v_preview->>'safe')::boolean,false) then
    raise exception 'backup_not_safe:%',coalesce((v_preview->'errors')::text,'[]') using errcode='22023';
  end if;
  v_fingerprint:=v_preview->>'backupFingerprint';
  if nullif(btrim(coalesce(p_expected_fingerprint,'')),'') is null
     or v_fingerprint is distinct from lower(btrim(p_expected_fingerprint)) then
    raise exception 'backup_fingerprint_mismatch' using errcode='22023';
  end if;

  v_checkpoint_payload:=financial_app.portable_backup_core();
  insert into financial_app.private_backup_checkpoints(created_by,reason,payload_fingerprint,payload)
  values(v_email,'pre_restore:'||left(v_fingerprint,12),md5(v_checkpoint_payload::text),v_checkpoint_payload)
  returning id into v_checkpoint_id;

  update financial_app.transactions
  set category_override=null,
      subcategory_override=null,
      type_override=null,
      normalized_concept_override=null,
      counterparty_override=null,
      description_override=null,
      effective_date=null,
      cash_flow_override=null,
      is_internal_transfer=false,
      is_duplicate=false,
      is_reconciled=null,
      needs_review=false,
      is_recurring=null,
      tags=array[]::text[],
      notes=null,
      personal_amount_override=null,
      updated_at=now()
  where category_override is not null
     or subcategory_override is not null
     or type_override is not null
     or normalized_concept_override is not null
     or counterparty_override is not null
     or description_override is not null
     or effective_date is not null
     or cash_flow_override is not null
     or is_internal_transfer
     or is_duplicate
     or is_reconciled is not null
     or needs_review
     or is_recurring is not null
     or cardinality(tags)>0
     or notes is not null
     or personal_amount_override is not null;

  update financial_app.transactions t
  set category_override=x."categoryOverride",
      subcategory_override=x."subcategoryOverride",
      type_override=x."typeOverride",
      normalized_concept_override=x."normalizedConceptOverride",
      counterparty_override=x."counterpartyOverride",
      description_override=x."descriptionOverride",
      effective_date=x."effectiveDate",
      cash_flow_override=x."cashFlowOverride",
      is_internal_transfer=coalesce(x."isInternalTransfer",false),
      is_duplicate=coalesce(x."isDuplicate",false),
      is_reconciled=x."isReconciled",
      needs_review=coalesce(x."needsReview",false),
      is_recurring=x."isRecurring",
      tags=coalesce(x.tags,array[]::text[]),
      notes=x.notes,
      personal_amount_override=x."personalAmountOverride",
      updated_at=now()
  from jsonb_to_recordset(financial_app.backup_array(p_backup,'transactionOverrides')) as x(
    "sourceId" text,
    "categoryOverride" text,
    "subcategoryOverride" text,
    "typeOverride" text,
    "normalizedConceptOverride" text,
    "counterpartyOverride" text,
    "descriptionOverride" text,
    "effectiveDate" date,
    "cashFlowOverride" boolean,
    "isInternalTransfer" boolean,
    "isDuplicate" boolean,
    "isReconciled" boolean,
    "needsReview" boolean,
    "isRecurring" boolean,
    tags text[],
    notes text,
    "personalAmountOverride" numeric
  )
  where t.source_id=x."sourceId";

  perform financial_app.backup_upsert_table_core('financial_app.budgets'::regclass,financial_app.backup_array(p_backup,'budgets'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.forecasts'::regclass,financial_app.backup_array(p_backup,'forecasts'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.net_worth_items'::regclass,financial_app.backup_array(p_backup,'netWorthItems'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.goals'::regclass,financial_app.backup_array(p_backup,'goals'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.transaction_rules'::regclass,financial_app.backup_array(p_backup,'rules'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.preferences'::regclass,financial_app.backup_array(p_backup,'preferences'),array['user_email']);
  perform financial_app.backup_upsert_table_core('financial_app.control_alert_states'::regclass,financial_app.backup_array(p_backup,'controlAlertStates'),array['alert_key']);
  perform financial_app.backup_upsert_table_core('financial_app.month_closes'::regclass,financial_app.backup_array(p_backup,'monthCloses'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.documents'::regclass,financial_app.backup_array(p_backup,'documents'),array['id'],array['ocr_text']);
  perform financial_app.backup_upsert_table_core('financial_app.transaction_splits'::regclass,financial_app.backup_array(p_backup,'splits'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.reconciliation_pairs'::regclass,financial_app.backup_array(p_backup,'reconciliationPairs'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.forecast_occurrences'::regclass,financial_app.backup_array(p_backup,'forecastOccurrences'),array['id']);
  perform financial_app.backup_upsert_table_core('financial_app.transaction_documents'::regclass,financial_app.backup_array(p_backup,'transactionDocuments'),array['transaction_id','document_id']);

  delete from financial_app.transaction_documents td
  where not exists(
    select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'transactionDocuments')) e(value)
    where e.value->>'transaction_id'=td.transaction_id::text
      and e.value->>'document_id'=td.document_id::text
  );
  delete from financial_app.transaction_splits s
  where not exists(
    select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'splits')) e(value)
    where e.value->>'id'=s.id::text
  );
  delete from financial_app.forecast_occurrences o
  where not exists(
    select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'forecastOccurrences')) e(value)
    where e.value->>'id'=o.id::text
  );
  delete from financial_app.control_alert_states s
  where not exists(
    select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'controlAlertStates')) e(value)
    where e.value->>'alert_key'=s.alert_key
  );
  delete from financial_app.month_closes c
  where not exists(
    select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'monthCloses')) e(value)
    where e.value->>'id'=c.id::text
  );

  update financial_app.budgets b set active=false,updated_at=now()
  where b.active and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'budgets'))e(value) where e.value->>'id'=b.id::text);
  update financial_app.forecasts f set status='cancelled',updated_at=now()
  where f.status<>'cancelled' and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'forecasts'))e(value) where e.value->>'id'=f.id::text);
  update financial_app.net_worth_items n set active=false,updated_at=now()
  where n.active and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'netWorthItems'))e(value) where e.value->>'id'=n.id::text);
  update financial_app.goals g set active=false,updated_at=now()
  where g.active and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'goals'))e(value) where e.value->>'id'=g.id::text);
  update financial_app.transaction_rules r set active=false,updated_at=now()
  where r.active and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'rules'))e(value) where e.value->>'id'=r.id::text);
  update financial_app.reconciliation_pairs r
  set status='cancelled',cancelled_by=v_email,cancelled_at=coalesce(cancelled_at,now())
  where r.status<>'cancelled'
    and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'reconciliationPairs'))e(value) where e.value->>'id'=r.id::text);
  update financial_app.documents d set archived_at=coalesce(d.archived_at,now()),updated_at=now()
  where d.archived_at is null
    and not exists(select 1 from jsonb_array_elements(financial_app.backup_array(p_backup,'documents'))e(value) where e.value->>'id'=d.id::text);

  delete from financial_app.private_backup_checkpoints
  where id in (
    select id from financial_app.private_backup_checkpoints
    order by created_at desc,id desc
    offset 10
  );

  return jsonb_build_object(
    'ok',true,
    'restored',true,
    'checkpointId',v_checkpoint_id,
    'backupFingerprint',v_fingerprint,
    'version',financial_app.current_app_version(),
    'source',v_preview->'source',
    'sections',v_preview->'sections'
  );
end
$$;

create or replace function public.financial_app_backup_export()
returns jsonb language sql stable security invoker
set search_path='pg_catalog','financial_app','auth'
as $$select financial_app.portable_backup_core()$$;

create or replace function public.financial_app_backup_validate(p_backup jsonb)
returns jsonb language sql stable security invoker
set search_path='pg_catalog','financial_app','auth'
as $$select financial_app.validate_portable_backup_core(p_backup)$$;

create or replace function public.financial_app_backup_preview(p_backup jsonb)
returns jsonb language sql stable security invoker
set search_path='pg_catalog','financial_app','auth'
as $$select financial_app.backup_preview_core(p_backup)$$;

create or replace function public.financial_app_backup_restore(p_backup jsonb,p_expected_fingerprint text,p_confirmation text)
returns jsonb language sql volatile security invoker
set search_path='pg_catalog','financial_app','auth'
as $$select financial_app.restore_portable_backup_core(p_backup,p_expected_fingerprint,p_confirmation)$$;

revoke all on function public.financial_app_backup_export() from public,anon;
revoke all on function public.financial_app_backup_validate(jsonb) from public,anon;
revoke all on function public.financial_app_backup_preview(jsonb) from public,anon;
revoke all on function public.financial_app_backup_restore(jsonb,text,text) from public,anon;
grant execute on function public.financial_app_backup_export() to authenticated,service_role;
grant execute on function public.financial_app_backup_validate(jsonb) to authenticated,service_role;
grant execute on function public.financial_app_backup_preview(jsonb) to authenticated,service_role;
grant execute on function public.financial_app_backup_restore(jsonb,text,text) to authenticated,service_role;

revoke all on function financial_app.portable_backup_core() from public,anon;
revoke all on function financial_app.validate_portable_backup_core(jsonb) from public,anon;
revoke all on function financial_app.backup_preview_core(jsonb) from public,anon;
revoke all on function financial_app.restore_portable_backup_core(jsonb,text,text) from public,anon;
grant execute on function financial_app.portable_backup_core() to authenticated,service_role;
grant execute on function financial_app.validate_portable_backup_core(jsonb) to authenticated,service_role;
grant execute on function financial_app.backup_preview_core(jsonb) to authenticated,service_role;
grant execute on function financial_app.restore_portable_backup_core(jsonb,text,text) to authenticated,service_role;

insert into financial_app.app_meta(key,value,updated_at)
values('app_version',to_jsonb('1.8.0'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
insert into financial_app.app_meta(key,value,updated_at)
values('target_version',to_jsonb('1.8.0'::text),now())
on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;

create or replace function financial_app.current_app_version()
returns text language sql stable security definer
set search_path='pg_catalog','financial_app'
as $$select coalesce((select value #>> '{}' from financial_app.app_meta where key='app_version'),'1.8.0')$$;

notify pgrst,'reload schema';
