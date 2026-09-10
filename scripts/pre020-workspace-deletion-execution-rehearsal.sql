-- PRE-020E · ensayo administrativo destructivo, EXCLUSIVAMENTE en DB desechable.
-- No crea executor runtime, endpoint ni permiso nuevo. Todo ocurre dentro de BEGIN/ROLLBACK.
-- El objetivo es probar barreras, orden SQL, aislamiento cross-tenant y cleanup OAuth/Vault.
\set ON_ERROR_STOP on

begin;

insert into auth.users(id)
values
  ('e9000000-0000-4000-8000-000000000001'::uuid),
  ('e9000000-0000-4000-8000-000000000002'::uuid);

insert into financial_app.workspaces(id,name)
values
  ('e1000000-0000-4000-8000-000000000001'::uuid,'PRE020E deletion rehearsal tenant A'),
  ('e2000000-0000-4000-8000-000000000002'::uuid,'PRE020E deletion rehearsal tenant B');

insert into financial_app.workspace_memberships(workspace_id,user_id,role,active,is_default)
values
  ('e1000000-0000-4000-8000-000000000001'::uuid,'e9000000-0000-4000-8000-000000000001'::uuid,'owner',true,false),
  ('e2000000-0000-4000-8000-000000000002'::uuid,'e9000000-0000-4000-8000-000000000002'::uuid,'owner',true,false);

insert into financial_app.accounts(
  id,workspace_id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order
) values
  ('e1100000-0000-4000-8000-000000000011'::uuid,'e1000000-0000-4000-8000-000000000001'::uuid,'PRE020E account A','Synthetic A','checking',10000,'EUR','active',0),
  ('e2100000-0000-4000-8000-000000000021'::uuid,'e2000000-0000-4000-8000-000000000002'::uuid,'PRE020E account B','Synthetic B','checking',20000,'EUR','active',0);

insert into financial_app.transaction_source_records(
  id,workspace_id,source_file_id,source_sheet_id,source_row_key,source_fingerprint,
  source_payload,bank_date,concept_original,amount_cents,balance_after_cents,
  account_external_key,source_row_identity
) values
  ('e1200000-0000-4000-8000-000000000012'::uuid,'e1000000-0000-4000-8000-000000000001'::uuid,
   'pre020e-source-a','sheet-a','A-1','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee01',
   '{"synthetic":true,"tenant":"A","gate":"PRE-020E"}'::jsonb,date '2026-09-10','PRE020E movement A',-1000,9000,'pre020e-account-a','pre020e-row-a-1'),
  ('e2200000-0000-4000-8000-000000000022'::uuid,'e2000000-0000-4000-8000-000000000002'::uuid,
   'pre020e-source-b','sheet-b','B-1','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee02',
   '{"synthetic":true,"tenant":"B","gate":"PRE-020E"}'::jsonb,date '2026-09-10','PRE020E movement B',-2000,18000,'pre020e-account-b','pre020e-row-b-1');

insert into financial_app.transactions(
  id,workspace_id,source_record_id,account_id,bank_date,concept_normalized,
  merchant_id,category_id,kind,amount_cents,balance_after_cents,review_state,
  duplicate_state,transfer_pair_id,source_row_identity
) values
  ('e1300000-0000-4000-8000-000000000013'::uuid,'e1000000-0000-4000-8000-000000000001'::uuid,
   'e1200000-0000-4000-8000-000000000012'::uuid,'e1100000-0000-4000-8000-000000000011'::uuid,
   date '2026-09-10','pre020e movement a',null,null,'expense',-1000,9000,'confirmed','none',null,'pre020e-row-a-1'),
  ('e2300000-0000-4000-8000-000000000023'::uuid,'e2000000-0000-4000-8000-000000000002'::uuid,
   'e2200000-0000-4000-8000-000000000022'::uuid,'e2100000-0000-4000-8000-000000000021'::uuid,
   date '2026-09-10','pre020e movement b',null,null,'expense',-2000,18000,'confirmed','none',null,'pre020e-row-b-1');

insert into financial_app.documents(
  id,workspace_id,type,status,original_file_name,mime_type,storage_provider,storage_key,
  source_drive_file_id,size_bytes,notes
) values
  ('e1400000-0000-4000-8000-000000000014'::uuid,'e1000000-0000-4000-8000-000000000001'::uuid,
   'invoice','imported','pre020e-a.pdf','application/pdf','supabase','pre020e/a.pdf',null,1234,''),
  ('e1500000-0000-4000-8000-000000000015'::uuid,'e1000000-0000-4000-8000-000000000001'::uuid,
   'invoice','imported','pre020e-drive-a.pdf','application/pdf','google_drive','drive-pre020e-a','drive-file-pre020e-a',2345,''),
  ('e2500000-0000-4000-8000-000000000025'::uuid,'e2000000-0000-4000-8000-000000000002'::uuid,
   'invoice','imported','pre020e-drive-b.pdf','application/pdf','google_drive','drive-pre020e-b','drive-file-pre020e-b',3456,'');

insert into financial_app.google_source_policy(workspace_id,id,allowed_email)
values
  ('e1000000-0000-4000-8000-000000000001'::uuid,true,'pre020e-a@example.test'),
  ('e2000000-0000-4000-8000-000000000002'::uuid,true,'pre020e-b@example.test');

select pg_catalog.set_config('financial_app.workspace_id','e1000000-0000-4000-8000-000000000001',false);
select * from financial_app.store_google_oauth_connection(
  'pre020e-subject-a','pre020e-a@example.test','pre020e-refresh-token-a',
  array['https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.metadata.readonly']::text[],
  'pre020e-bank-file-a','PRE020E bank file A'
);

select pg_catalog.set_config('financial_app.workspace_id','e2000000-0000-4000-8000-000000000002',false);
select * from financial_app.store_google_oauth_connection(
  'pre020e-subject-b','pre020e-b@example.test','pre020e-refresh-token-b',
  array['https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.metadata.readonly']::text[],
  'pre020e-bank-file-b','PRE020E bank file B'
);

-- Preparar y confirmar A mediante el mismo rol RLS de negocio. Confirmar nunca borra.
set role financial_app_gateway;
select
  pg_catalog.set_config('financial_app.workspace_id','e1000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.user_id','e9000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.workspace_role','owner',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','1',false);

do $$
declare
  v_prepared jsonb;
  v_confirmed jsonb;
begin
  v_prepared := financial_app.prepare_workspace_deletion_intent('e3000000-0000-4000-8000-000000000003'::uuid);
  v_confirmed := financial_app.confirm_workspace_deletion_intent(
    (v_prepared->>'intentId')::uuid,
    (v_prepared->>'confirmationNonce')::uuid
  );
  if v_confirmed->>'status' <> 'confirmed'
     or not (v_confirmed->>'executionReady')::boolean
     or (v_confirmed->>'destructiveOperationExecuted')::boolean then
    raise exception 'PRE020E_CONFIRMATION_BARRIER_INVALID:%',v_confirmed;
  end if;
end
$$;

-- El gateway no obtiene capacidad destructiva por confirmar.
do $$
declare v_blocked boolean := false;
begin
  begin
    delete from financial_app.workspaces
    where id='e1000000-0000-4000-8000-000000000001'::uuid;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'PRE020E_GATEWAY_ROOT_DELETE_ALLOWED'; end if;
end
$$;

do $$
declare v_blocked boolean := false;
begin
  begin
    delete from financial_app.transaction_source_records
    where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'PRE020E_GATEWAY_BANK_DELETE_ALLOWED'; end if;
end
$$;
reset role;

-- Confirmar no debe haber tocado ninguna fila de negocio.
do $$
declare v_count integer;
begin
  select count(*)::int into v_count from financial_app.accounts
  where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid;
  if v_count <> 1 then raise exception 'PRE020E_CONFIRMATION_CHANGED_ACCOUNTS:%',v_count; end if;
  select count(*)::int into v_count from financial_app.transaction_source_records
  where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid;
  if v_count <> 1 then raise exception 'PRE020E_CONFIRMATION_CHANGED_BANK_SOURCE:%',v_count; end if;
end
$$;

-- El snapshot confirmado debe preservar expresamente las dos fuentes externas.
do $$
declare v_snapshot jsonb;
begin
  select impact_snapshot into v_snapshot
  from financial_app.workspace_deletion_intents
  where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid and status='confirmed';
  if v_snapshot #>> '{effects,officialBankSource}' <> 'untouched'
     or v_snapshot #>> '{effects,googleDriveFiles}' <> 'untouched'
     or (v_snapshot #>> '{summary,supabaseManagedDocuments}')::integer <> 1
     or (v_snapshot #>> '{summary,googleDriveDocumentReferences}')::integer <> 1 then
    raise exception 'PRE020E_IMPACT_SNAPSHOT_INVALID:%',v_snapshot;
  end if;
end
$$;

-- Borrar la raíz antes de limpiar dependencias debe fallar por diseño (ON DELETE RESTRICT).
do $$
declare v_blocked boolean := false;
begin
  begin
    delete from financial_app.workspaces
    where id='e1000000-0000-4000-8000-000000000001'::uuid;
  exception when foreign_key_violation then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'PRE020E_ROOT_DELETE_BYPASSED_RESTRICT'; end if;
end
$$;

-- Incluso como administrador de la DB, la copia bancaria local sigue protegida por trigger.
do $$
declare v_blocked boolean := false;
begin
  begin
    delete from financial_app.transaction_source_records
    where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid;
  exception when others then
    if sqlerrm='bank source records are immutable' then v_blocked := true; else raise; end if;
  end;
  if not v_blocked then raise exception 'PRE020E_BANK_IMMUTABILITY_TRIGGER_BYPASSED'; end if;
end
$$;

-- Revalidar snapshot inmediatamente antes de cualquier cleanup simulado.
select
  pg_catalog.set_config('financial_app.workspace_id','e1000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.user_id','e9000000-0000-4000-8000-000000000001',false),
  pg_catalog.set_config('financial_app.workspace_role','owner',false),
  pg_catalog.set_config('financial_app.workspace_membership_count','1',false);
do $$
declare v_expected jsonb; v_current jsonb;
begin
  select impact_snapshot into v_expected
  from financial_app.workspace_deletion_intents
  where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid and status='confirmed';
  v_current := financial_app.workspace_deletion_impact();
  if v_current is distinct from v_expected then
    raise exception 'PRE020E_REVALIDATION_CHANGED expected=% current=%',v_expected,v_current;
  end if;
end
$$;

-- OAuth/Vault sí puede ensayarse de forma real en la DB desechable mediante la función
-- workspace-scoped ya validada. A desaparece; B y su secreto deben seguir intactos.
do $$
begin
  if not financial_app.disconnect_google_oauth_connection() then
    raise exception 'PRE020E_OAUTH_DISCONNECT_A_FAILED';
  end if;
  if exists (
    select 1 from financial_app.google_oauth_connections
    where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid
  ) then raise exception 'PRE020E_OAUTH_A_RESIDUE'; end if;
  if exists (
    select 1 from vault.secrets
    where name='financial_app_google_refresh_token_e1000000-0000-4000-8000-000000000001'
  ) then raise exception 'PRE020E_VAULT_A_RESIDUE'; end if;
  if not exists (
    select 1 from financial_app.google_oauth_connections
    where workspace_id='e2000000-0000-4000-8000-000000000002'::uuid
  ) then raise exception 'PRE020E_OAUTH_B_DAMAGED'; end if;
  if not exists (
    select 1 from vault.secrets
    where name='financial_app_google_refresh_token_e2000000-0000-4000-8000-000000000002'
  ) then raise exception 'PRE020E_VAULT_B_DAMAGED'; end if;
end
$$;

-- El stub PostgreSQL deliberadamente NO simula la API real de objetos de Supabase Storage.
-- Si algún día existe aquí, el gate obliga a ampliar el ensayo en vez de fingir cobertura.
do $$
begin
  if pg_catalog.to_regclass('storage.objects') is not null then
    raise exception 'PRE020E_STORAGE_STUB_CHANGED_UPDATE_RUNTIME_COVERAGE';
  end if;
end
$$;

-- Ensayo ADMIN-ONLY del orden SQL. No es código de runtime. Se descubren dinámicamente
-- las tablas workspace-scoped y se vacían de hijos a padres, excluyendo intents/memberships
-- (cascada de la raíz) y la fuente bancaria inmutable (tratada después de forma explícita).
create temp table pre020e_pending_tables(table_name text primary key) on commit drop;
insert into pre020e_pending_tables(table_name)
select distinct c.table_name
from information_schema.columns c
where c.table_schema='financial_app'
  and c.column_name='workspace_id'
  and c.table_name not in (
    'workspace_deletion_intents',
    'workspace_memberships',
    'transaction_source_records'
  );

do $$
declare
  v_table text;
  v_remaining integer;
  v_guard integer := 0;
begin
  loop
    select count(*)::int into v_remaining from pre020e_pending_tables;
    exit when v_remaining=0;

    v_table := null;
    select p.table_name into v_table
    from pre020e_pending_tables p
    where not exists (
      select 1
      from pg_catalog.pg_constraint fk
      join pg_catalog.pg_class child on child.oid=fk.conrelid
      join pg_catalog.pg_namespace child_ns on child_ns.oid=child.relnamespace
      join pg_catalog.pg_class parent on parent.oid=fk.confrelid
      join pg_catalog.pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
      where fk.contype='f'
        and child_ns.nspname='financial_app'
        and parent_ns.nspname='financial_app'
        and parent.relname=p.table_name
        and child.relname<>parent.relname
        and child.relname in (select table_name from pre020e_pending_tables)
    )
    order by p.table_name
    limit 1;

    if v_table is null then
      raise exception 'PRE020E_DEPENDENCY_ORDER_CYCLE:%',
        (select pg_catalog.string_agg(table_name,',' order by table_name) from pre020e_pending_tables);
    end if;

    execute pg_catalog.format(
      'delete from financial_app.%I where workspace_id=$1',v_table
    ) using 'e1000000-0000-4000-8000-000000000001'::uuid;

    delete from pre020e_pending_tables where table_name=v_table;
    v_guard := v_guard+1;
    if v_guard>100 then raise exception 'PRE020E_DEPENDENCY_ORDER_GUARD'; end if;
  end loop;
end
$$;

-- Sólo dentro de este ROLLBACK rehearsal, el administrador desactiva temporalmente el
-- trigger de DELETE para validar que la copia local puede purgarse tras sus dependencias.
-- Esto NO se añade a ninguna migración, función, rol ni endpoint de producto.
alter table financial_app.transaction_source_records
  disable trigger transaction_source_records_no_delete;
delete from financial_app.transaction_source_records
where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid;
alter table financial_app.transaction_source_records
  enable trigger transaction_source_records_no_delete;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='financial_app'
      and c.relname='transaction_source_records'
      and t.tgname='transaction_source_records_no_delete'
      and t.tgenabled='O'
      and not t.tgisinternal
  ) then raise exception 'PRE020E_BANK_DELETE_TRIGGER_NOT_REENABLED'; end if;
end
$$;

-- Con los datos locales ya vacíos, la raíz elimina sólo membership + intent por CASCADE.
delete from financial_app.workspaces
where id='e1000000-0000-4000-8000-000000000001'::uuid;

-- Residuo cero para A en DB y aislamiento intacto para B.
do $$
declare
  r record;
  v_count bigint;
begin
  if exists (select 1 from financial_app.workspaces where id='e1000000-0000-4000-8000-000000000001'::uuid)
     or exists (select 1 from financial_app.workspace_memberships where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid)
     or exists (select 1 from financial_app.workspace_deletion_intents where workspace_id='e1000000-0000-4000-8000-000000000001'::uuid) then
    raise exception 'PRE020E_TARGET_CONTROL_PLANE_RESIDUE';
  end if;

  for r in
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema='financial_app' and c.column_name='workspace_id'
      and c.table_name not in ('workspace_memberships','workspace_deletion_intents')
  loop
    execute pg_catalog.format('select count(*) from financial_app.%I where workspace_id=$1',r.table_name)
      into v_count using 'e1000000-0000-4000-8000-000000000001'::uuid;
    if v_count<>0 then raise exception 'PRE020E_TARGET_TABLE_RESIDUE table=% count=%',r.table_name,v_count; end if;
  end loop;

  if (select count(*) from financial_app.workspaces where id='e2000000-0000-4000-8000-000000000002'::uuid)<>1
     or (select count(*) from financial_app.workspace_memberships where workspace_id='e2000000-0000-4000-8000-000000000002'::uuid)<>1
     or (select count(*) from financial_app.accounts where workspace_id='e2000000-0000-4000-8000-000000000002'::uuid)<>1
     or (select count(*) from financial_app.transactions where workspace_id='e2000000-0000-4000-8000-000000000002'::uuid)<>1
     or (select count(*) from financial_app.transaction_source_records where workspace_id='e2000000-0000-4000-8000-000000000002'::uuid)<>1
     or (select count(*) from financial_app.documents where workspace_id='e2000000-0000-4000-8000-000000000002'::uuid)<>1
     or (select count(*) from financial_app.google_oauth_connections where workspace_id='e2000000-0000-4000-8000-000000000002'::uuid)<>1 then
    raise exception 'PRE020E_CROSS_TENANT_DAMAGE';
  end if;
end
$$;

rollback;

-- El rehearsal no deja datos sintéticos ni cambios de DDL al finalizar.
do $$
begin
  if exists (
    select 1 from financial_app.workspaces
    where id in (
      'e1000000-0000-4000-8000-000000000001'::uuid,
      'e2000000-0000-4000-8000-000000000002'::uuid
    )
  ) then raise exception 'PRE020E_ROLLBACK_WORKSPACE_RESIDUE'; end if;
  if exists (
    select 1 from vault.secrets
    where name in (
      'financial_app_google_refresh_token_e1000000-0000-4000-8000-000000000001',
      'financial_app_google_refresh_token_e2000000-0000-4000-8000-000000000002'
    )
  ) then raise exception 'PRE020E_ROLLBACK_VAULT_RESIDUE'; end if;
end
$$;

\echo PRE020_DELETION_EXECUTION_REHEARSAL_OK
