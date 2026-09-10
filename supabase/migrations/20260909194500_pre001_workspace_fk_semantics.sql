-- Financial App · PRE-001 · preservación exacta de semántica FK al añadir workspace_id
-- Corrige la capa compuesta para conservar ON DELETE del contrato legacy.
-- Especialmente importante: SET NULL sólo puede limpiar la columna referenciada;
-- workspace_id permanece NOT NULL y nunca cambia por una baja de la entidad padre.

do $$
declare
  r record;
  v_constraint text;
  v_delete_clause text;
begin
  for r in
    select
      child.relname as child_table,
      parent.relname as parent_table,
      child_col.attname as child_column,
      parent_col.attname as parent_column,
      c.confdeltype
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = c.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    join pg_attribute child_col
      on child_col.attrelid = c.conrelid and child_col.attnum = c.conkey[1]
    join pg_attribute parent_col
      on parent_col.attrelid = c.confrelid and parent_col.attnum = c.confkey[1]
    where c.contype = 'f'
      and child_ns.nspname = 'financial_app'
      and parent_ns.nspname = 'financial_app'
      and array_length(c.conkey,1) = 1
      and child_col.attname <> 'workspace_id'
      and exists (
        select 1 from information_schema.columns x
        where x.table_schema='financial_app'
          and x.table_name=child.relname
          and x.column_name='workspace_id'
      )
      and exists (
        select 1 from information_schema.columns x
        where x.table_schema='financial_app'
          and x.table_name=parent.relname
          and x.column_name='workspace_id'
      )
  loop
    v_constraint := r.child_table || '_' || r.child_column || '_workspace_fkey';

    v_delete_clause := case r.confdeltype
      when 'c' then ' on delete cascade'
      when 'r' then ' on delete restrict'
      when 'n' then format(' on delete set null (%I)', r.child_column)
      when 'd' then format(' on delete set default (%I)', r.child_column)
      else ' on delete no action'
    end;

    execute format(
      'alter table financial_app.%I drop constraint if exists %I',
      r.child_table,
      v_constraint
    );

    execute format(
      'alter table financial_app.%I add constraint %I foreign key (workspace_id,%I) references financial_app.%I(workspace_id,%I)%s not valid',
      r.child_table,
      v_constraint,
      r.child_column,
      r.parent_table,
      r.parent_column,
      v_delete_clause
    );

    execute format(
      'alter table financial_app.%I validate constraint %I',
      r.child_table,
      v_constraint
    );
  end loop;
end
$$;

-- PRE-001 invariant: workspace_reference_mismatch se impide estructuralmente por FK compuesta.
