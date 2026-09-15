begin;

-- Reproduce el contrato real del Edge Gateway: contexto de workspace + SET ROLE.
select set_config(
  'financial_app.workspace_id',
  (select id::text from financial_app.workspaces order by created_at,id limit 1),
  true
);
set local role financial_app_gateway;

do $$
declare
  v_account_id uuid;
  v_first record;
  v_revision record;
  v_first_source_id uuid;
begin
  if has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','UPDATE')
     or has_table_privilege('financial_app_gateway','financial_app.transaction_source_records','DELETE') then
    raise exception 'gateway_must_not_mutate_source_records';
  end if;

  v_account_id := financial_app.ensure_source_account_mapping(
    '__gateway_immutable_lock__',
    'gateway-test-account',
    'Cuenta gateway lock test',
    'Banco test',
    'checking',
    0,
    'active',
    '****9915'
  );

  if v_account_id is null then
    raise exception 'gateway_account_mapping_failed';
  end if;

  select * into v_first
  from financial_app.ingest_source_observation(
    '__gateway_immutable_lock__',
    'sheet-lock',
    'ROW-1',
    '__gateway_immutable_lock__::sheet-lock::ROW-1',
    repeat('1',64),
    '{"ID origen":"ROW-1","revision":1}'::jsonb,
    '2026-09-15',
    'PRUEBA LOCK',
    'PRUEBA LOCK',
    -100,
    9900,
    'gateway-test-account',
    'expense',
    'pending',
    '2026-09-15T08:45:00Z'
  );

  if v_first.action <> 'insert' or v_first.source_record_id is null or v_first.transaction_id is null then
    raise exception 'gateway_first_ingest_failed';
  end if;
  v_first_source_id := v_first.source_record_id;

  select * into v_revision
  from financial_app.ingest_source_observation(
    '__gateway_immutable_lock__',
    'sheet-lock',
    'ROW-1',
    '__gateway_immutable_lock__::sheet-lock::ROW-1',
    repeat('2',64),
    '{"ID origen":"ROW-1","revision":2}'::jsonb,
    '2026-09-15',
    'PRUEBA LOCK REVISADA',
    'PRUEBA LOCK REVISADA',
    -125,
    9875,
    'gateway-test-account',
    'expense',
    'needs_review',
    '2026-09-15T08:46:00Z'
  );

  if v_revision.action <> 'append_revision'
     or v_revision.transaction_id <> v_first.transaction_id
     or v_revision.source_record_id = v_first_source_id then
    raise exception 'gateway_revision_ingest_failed';
  end if;

  if (
    select supersedes_source_record_id
    from financial_app.transaction_source_records
    where id=v_revision.source_record_id
  ) is distinct from v_first_source_id then
    raise exception 'gateway_revision_chain_failed';
  end if;

  -- La reparación no puede convertir el histórico bancario en mutable.
  begin
    update financial_app.transaction_source_records
    set concept_original='MUTACION PROHIBIDA'
    where id=v_first_source_id;
    raise exception 'expected_gateway_source_update_rejection';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm='expected_gateway_source_update_rejection' then raise; end if;
      if position('immutable' in lower(sqlerrm))=0 and position('permission denied' in lower(sqlerrm))=0 then
        raise;
      end if;
  end;
end
$$;

rollback;