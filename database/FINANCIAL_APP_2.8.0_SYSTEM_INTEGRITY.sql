-- Financial App 2.8.0 · Integridad del sistema y auditorías persistentes
-- Abrir Control permanece en solo lectura. Solo financial_app_run_system_audit()
-- persiste una fotografía técnica cuando el usuario ejecuta la acción explícitamente.

create table if not exists financial_app.system_audits(
  id bigint generated always as identity primary key,
  status text not null check(status in('healthy','warning','critical')),
  snapshot jsonb not null,
  fingerprint text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table financial_app.system_audits enable row level security;
revoke all on financial_app.system_audits from public,anon,authenticated;

create or replace function financial_app.system_integrity_snapshot_core(p_deep boolean default false)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','financial_app','auth','storage'
as $$
declare
  v_email text:=financial_app.authorized_email();
  v_transactions int; v_missing_hash int; v_source_missing int; v_duplicate_source_ids int; v_duplicate_flagged int;
  v_needs_review int; v_missing_account int; v_orphan_account int; v_edited int; v_active_accounts int;
  v_history int; v_splits int; v_rules int; v_rule_apps int; v_closes int; v_alert_states int;
  v_sync_status text; v_sync_at timestamptz; v_sync_new int; v_sync_updated int; v_sync_review int;
  v_source_mode text; v_source_file_id text; v_archive_public boolean; v_archive_limit bigint;
  v_source_checksum text; v_structural_fingerprint text; v_checks jsonb; v_status text;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;

  select count(*)::int,
    count(*) filter(where source_hash is null or btrim(source_hash)='')::int,
    count(*) filter(where source_missing)::int,
    count(*) filter(where is_duplicate)::int,
    count(*) filter(where needs_review)::int,
    count(*) filter(where account_id is null)::int,
    count(*) filter(where account_id is not null and not exists(select 1 from financial_app.accounts a where a.id=t.account_id))::int,
    count(*) filter(where category_override is not null or subcategory_override is not null or counterparty_override is not null or type_override is not null or normalized_concept_override is not null or description_override is not null or cash_flow_override is not null or personal_amount_override is not null)::int
  into v_transactions,v_missing_hash,v_source_missing,v_duplicate_flagged,v_needs_review,v_missing_account,v_orphan_account,v_edited
  from financial_app.transactions t;

  select count(*)::int into v_duplicate_source_ids from (select source_id from financial_app.transactions group by source_id having count(*)>1) d;
  select count(*) filter(where active)::int into v_active_accounts from financial_app.accounts;
  select count(*)::int into v_history from financial_app.transaction_history;
  select count(*)::int into v_splits from financial_app.transaction_splits;
  select count(*)::int into v_rules from financial_app.transaction_rules;
  select count(*)::int into v_rule_apps from financial_app.transaction_rule_applications;
  select count(*)::int into v_closes from financial_app.month_closes;
  select count(*)::int into v_alert_states from financial_app.control_alert_states;

  select status,started_at,new_count,updated_count,review_count into v_sync_status,v_sync_at,v_sync_new,v_sync_updated,v_sync_review
  from financial_app.sync_runs order by started_at desc limit 1;
  select value->>'mode',value->>'file_id' into v_source_mode,v_source_file_id from financial_app.app_meta where key='source';
  select public,file_size_limit into v_archive_public,v_archive_limit from storage.buckets where id='financial-app-documents';

  if p_deep then
    select md5(coalesce(string_agg(coalesce(source_id,'')||':'||coalesce(source_hash,''),'|' order by source_id),'')) into v_source_checksum
    from financial_app.transactions;
  end if;

  v_structural_fingerprint:=md5(jsonb_build_object(
    'transactions',v_transactions,'missingHash',v_missing_hash,'sourceMissing',v_source_missing,'duplicateSourceIds',v_duplicate_source_ids,
    'duplicateFlagged',v_duplicate_flagged,'needsReview',v_needs_review,'missingAccount',v_missing_account,'orphanAccount',v_orphan_account,
    'editedTransactions',v_edited,'activeAccounts',v_active_accounts,'historyRows',v_history,'splitRows',v_splits,'rules',v_rules,
    'ruleApplications',v_rule_apps,'monthCloses',v_closes,'alertStates',v_alert_states,'syncStatus',v_sync_status,'syncAt',v_sync_at,
    'sourceMode',v_source_mode,'sourceFileConfigured',v_source_file_id is not null,'archivePublic',v_archive_public,'archiveLimit',v_archive_limit
  )::text);

  v_checks:=jsonb_build_array(
    jsonb_build_object('key','source_read_only','label','Fuente en solo lectura','status',case when v_source_mode='read_only' then 'pass' else 'fail' end,'detail',coalesce(v_source_mode,'sin configurar')),
    jsonb_build_object('key','source_configured','label','Fuente configurada','status',case when v_source_file_id is not null then 'pass' else 'fail' end,'detail',case when v_source_file_id is not null then 'Archivo origen identificado' else 'Falta el identificador del origen' end),
    jsonb_build_object('key','source_hashes','label','Huellas de origen','status',case when v_missing_hash=0 then 'pass' else 'fail' end,'detail',v_missing_hash||' movimientos sin huella'),
    jsonb_build_object('key','source_ids','label','Identificadores únicos','status',case when v_duplicate_source_ids=0 then 'pass' else 'fail' end,'detail',v_duplicate_source_ids||' identificadores duplicados'),
    jsonb_build_object('key','accounts','label','Integridad de cuentas','status',case when v_missing_account=0 and v_orphan_account=0 then 'pass' else 'fail' end,'detail',(v_missing_account+v_orphan_account)||' movimientos sin cuenta válida'),
    jsonb_build_object('key','archive_private','label','Archivo privado','status',case when v_archive_public=false then 'pass' else 'fail' end,'detail',case when v_archive_public=false then 'Bucket privado' else 'Revisar privacidad del bucket' end),
    jsonb_build_object('key','sync','label','Última sincronización','status',case when v_sync_status='success' then 'pass' else 'warning' end,'detail',coalesce(v_sync_status,'sin sincronizaciones')),
    jsonb_build_object('key','source_continuity','label','Continuidad del origen','status',case when v_source_missing=0 then 'pass' else 'warning' end,'detail',v_source_missing||' movimientos ya no presentes en origen'),
    jsonb_build_object('key','review_queue','label','Calidad pendiente','status',case when v_needs_review=0 then 'pass' else 'warning' end,'detail',v_needs_review||' movimientos pendientes de revisión')
  );

  select case
    when exists(select 1 from jsonb_array_elements(v_checks) c where c->>'status'='fail') then 'critical'
    when exists(select 1 from jsonb_array_elements(v_checks) c where c->>'status'='warning') then 'warning'
    else 'healthy' end into v_status;

  return jsonb_build_object(
    'version',financial_app.current_app_version(),'generatedAt',now(),'status',v_status,'deep',p_deep,
    'fingerprint',v_structural_fingerprint,'sourceChecksum',v_source_checksum,'checks',v_checks,
    'source',jsonb_build_object('mode',v_source_mode,'fileConfigured',v_source_file_id is not null,'transactions',v_transactions,'missingHashes',v_missing_hash,'sourceMissing',v_source_missing,'duplicateSourceIds',v_duplicate_source_ids,'duplicateFlagged',v_duplicate_flagged),
    'quality',jsonb_build_object('needsReview',v_needs_review,'missingAccount',v_missing_account,'orphanAccount',v_orphan_account),
    'sync',jsonb_build_object('status',v_sync_status,'startedAt',v_sync_at,'newCount',coalesce(v_sync_new,0),'updatedCount',coalesce(v_sync_updated,0),'reviewCount',coalesce(v_sync_review,0)),
    'privateLayers',jsonb_build_object('editedTransactions',v_edited,'historyRows',v_history,'splits',v_splits,'rules',v_rules,'ruleApplications',v_rule_apps,'monthCloses',v_closes,'alertStates',v_alert_states),
    'infrastructure',jsonb_build_object('activeAccounts',v_active_accounts,'archivePrivate',v_archive_public=false,'archiveFileSizeLimit',v_archive_limit)
  );
end $$;

create or replace function financial_app.system_integrity_overview_core()
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare v_current jsonb; v_history jsonb;
begin
  if financial_app.authorized_email() is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_current:=financial_app.system_integrity_snapshot_core(false);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'status',status,'fingerprint',fingerprint,'sourceChecksum',snapshot->>'sourceChecksum','createdAt',created_at,'checks',snapshot->'checks'
  ) order by created_at desc),'[]'::jsonb) into v_history
  from (select * from financial_app.system_audits order by created_at desc limit 12) a;
  return jsonb_build_object('current',v_current,'history',v_history,'persistent',true,'readOnlyOnLoad',true);
end $$;

create or replace function financial_app.run_system_audit_core()
returns jsonb
language plpgsql
volatile security definer
set search_path to 'pg_catalog','financial_app','auth'
as $$
declare v_email text:=financial_app.authorized_email(); v_snapshot jsonb; v_id bigint;
begin
  if v_email is null then raise exception 'forbidden' using errcode='42501'; end if;
  v_snapshot:=financial_app.system_integrity_snapshot_core(true);
  insert into financial_app.system_audits(status,snapshot,fingerprint,created_by)
  values(v_snapshot->>'status',v_snapshot,v_snapshot->>'fingerprint',v_email) returning id into v_id;
  return jsonb_build_object('ok',true,'auditId',v_id,'snapshot',v_snapshot);
end $$;

create or replace function public.financial_app_system_integrity()
returns jsonb
language sql stable
set search_path to 'pg_catalog','financial_app','auth'
as $$select financial_app.system_integrity_overview_core()$$;

create or replace function public.financial_app_run_system_audit()
returns jsonb
language sql volatile
set search_path to 'pg_catalog','financial_app','auth'
as $$select financial_app.run_system_audit_core()$$;

revoke all on function public.financial_app_system_integrity() from public,anon;
revoke all on function public.financial_app_run_system_audit() from public,anon;
grant execute on function public.financial_app_system_integrity() to authenticated;
grant execute on function public.financial_app_run_system_audit() to authenticated;
