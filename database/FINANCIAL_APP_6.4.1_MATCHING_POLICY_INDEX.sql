begin;

-- Financial App 6.4.1 — hardening medido del historial de políticas de matching.
-- No modifica movimientos, documentos ni políticas: únicamente añade el índice que cubre
-- la FK de supersedes_policy_id detectada por el Performance Advisor de Supabase.
do $$
begin
  if to_regclass('financial_app.document_matching_policies') is null then
    raise exception 'financial_app_6_4_1_matching_policy_table_missing';
  end if;
end
$$;

create index if not exists document_matching_policies_supersedes_policy_id_idx
  on financial_app.document_matching_policies(supersedes_policy_id);

do $$
begin
  if not exists(
    select 1
    from pg_indexes
    where schemaname='financial_app'
      and tablename='document_matching_policies'
      and indexname='document_matching_policies_supersedes_policy_id_idx'
  ) then
    raise exception 'financial_app_6_4_1_matching_policy_index_missing';
  end if;
end
$$;

commit;
