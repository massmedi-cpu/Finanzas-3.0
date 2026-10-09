-- DOC-002 / NAV-001. Synthetic fixtures only, same disposable CI service as PTO/INI.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='90s';
insert into financial_app.workspaces(id,name) values
  ('a0d20000-0000-4000-8000-000000000001','AUD document A'),
  ('a0d20000-0000-4000-8000-000000000002','AUD document B');
select pg_catalog.set_config('financial_app.workspace_id','a0d20000-0000-4000-8000-000000000001',true);
select pg_catalog.set_config('financial_app.user_id','80000000-0000-4000-8000-000000000001',true);
select pg_catalog.set_config('financial_app.workspace_role','owner',true);
set local role financial_app_gateway;
create temp table aud_doc_ids(key text primary key,id uuid not null) on commit drop;
insert into aud_doc_ids values
 ('fixture',(financial_app.register_document('other','F11_DRIVE_LIVE_OCR_TEST.png','image/png','google_drive','aud-doc-fixture','aud-fixture',1234,null)->'document'->>'id')::uuid),
 ('ordinary',(financial_app.register_document('invoice','Factura real.png','image/png','google_drive','aud-doc-ordinary','aud-ordinary',2345,null)->'document'->>'id')::uuid),
 ('filename',(financial_app.register_document('invoice','OCR_TEST_fixture.png','image/png','google_drive','aud-doc-filename','aud-filename',3456,null)->'document'->>'id')::uuid);
select financial_app.update_document_metadata(id,'other','2026-09-02','AUD proveedor',5404,'Fixture sintético F11: declarado en notas, aún no designado')
from aud_doc_ids where key='fixture';
select financial_app.set_document_status(id,'pending_review') from aud_doc_ids;
create temp table aud_doc_originals on commit drop as
select id,to_jsonb(d)-array['is_test','test_designation_updated_at','test_designation_updated_by','test_designation_reason','updated_at'] as original
from financial_app.documents d;

do $$
declare v_id uuid := (select id from aud_doc_ids where key='fixture'); v_result jsonb;
begin
  if (financial_app.document_list()->>'total')::int<>3 then raise exception 'DOC ordinary baseline or filename inference failed'; end if;
  if (financial_app.document_list_filtered(null,null,50,0,'tests',false)->>'total')::int<>0 then raise exception 'DOC notes inferred test designation'; end if;
  begin
    perform financial_app.set_document_test_designation(v_id,true,'AUD owner review',false);
    raise exception 'DOC missing owner acknowledgement accepted';
  exception when others then
    if sqlerrm<>'invalid_document_owner_review' then raise; end if;
  end;
  begin
    perform financial_app.set_document_test_designation(v_id,true,' ',true);
    raise exception 'DOC empty reason accepted';
  exception when others then
    if sqlerrm<>'invalid_document_designation_reason' then raise; end if;
  end;
  perform pg_catalog.set_config('financial_app.workspace_role','member',true);
  if financial_app.document_detail(v_id)#>>'{principles,testDesignationEditable}'<>'false' then
    raise exception 'DOC member sees owner-only confirmation';
  end if;
  begin
    perform financial_app.set_document_test_designation(v_id,true,'AUD member',true);
    raise exception 'DOC non-owner designation accepted';
  exception when others then
    if sqlerrm<>'document_owner_review_required' then raise; end if;
  end;
  perform pg_catalog.set_config('financial_app.workspace_role','owner',true);
  v_result:=financial_app.set_document_test_designation(v_id,true,'AUD owner checked source',true);
  if v_result#>>'{document,isTest}'<>'true' or v_result#>>'{document,testDesignationReason}'<>'AUD owner checked source'
    or v_result#>>'{principles,testDesignationEditable}'<>'true' then raise exception 'DOC designation not persisted'; end if;
  if (financial_app.document_list('pending_review',null,1,0)->>'total')::int<>2 then raise exception 'DOC review count includes test'; end if;
  if (financial_app.document_list_filtered(null,null,1,0,'ordinary',true)->>'total')::int<>2 then raise exception 'DOC unassociated count includes test'; end if;
  perform financial_app.set_document_status((select id from aud_doc_ids where key='ordinary'),'archived');
  if (financial_app.document_list_filtered(null,null,1,0,'ordinary',true)->>'total')::int<>1 then raise exception 'DOC unassociated count includes archived'; end if;
  perform financial_app.set_document_status((select id from aud_doc_ids where key='ordinary'),'pending_review');
  if (financial_app.document_list_filtered(null,null,1,0,'tests',false)->>'total')::int<>1 then raise exception 'DOC tests view missing'; end if;
  if (financial_app.document_list_filtered(null,null,1,0,'all',false)->>'total')::int<>3 then raise exception 'DOC all view incomplete'; end if;
  if financial_app.document_list_filtered(null,'checked source',50,0,'tests',false)->>'total'<>'0' then raise exception 'DOC reason silently rewrote notes'; end if;
  if financial_app.document_list_filtered(null,'sintético',50,0,'tests',false)->>'total'<>'1' then raise exception 'DOC notes search failed'; end if;
  perform financial_app.set_document_test_designation(v_id,true,'AUD replay must not rewrite reason',true);
  if (select count(*) from financial_app.audit_changes where entity_id=v_id and field_name='test_designation')<>1 then raise exception 'DOC replay duplicated audit'; end if;
  if financial_app.document_detail(v_id)#>>'{document,testDesignationReason}'<>'AUD owner checked source' then raise exception 'DOC replay changed provenance'; end if;
end;
$$;

-- Fill more than the first page. Server filtering must count the full universe.
insert into financial_app.documents(type,status,original_file_name,mime_type,storage_provider,storage_key,source_drive_file_id,notes)
select 'other','pending_review','AUD page '||n||'.png','image/png','google_drive','aud-page-'||n,'aud-page-'||n,''
from generate_series(1,55) n;
do $$
declare v_id uuid := (select id from aud_doc_ids where key='fixture'); v_result jsonb;
begin
  v_result:=financial_app.document_list_filtered('pending_review',null,50,0,'ordinary',true);
  if (v_result->>'total')::int<>57 or jsonb_array_length(v_result->'items')<>50 then raise exception 'DOC filtered first-page total mismatch'; end if;
  v_result:=financial_app.document_list_filtered('pending_review',null,50,50,'ordinary',true);
  if (v_result->>'total')::int<>57 or jsonb_array_length(v_result->'items')<>7 then raise exception 'DOC filtered second page mismatch'; end if;
  perform pg_catalog.set_config('financial_app.workspace_id','a0d20000-0000-4000-8000-000000000002',true);
  if financial_app.document_list()->>'total'<>'0' then raise exception 'DOC cross-workspace list leaked'; end if;
  begin
    perform financial_app.set_document_test_designation(v_id,false,'AUD other owner',true);
    raise exception 'DOC cross-workspace write accepted';
  exception when others then if sqlerrm<>'document_not_found' then raise; end if; end;
  perform pg_catalog.set_config('financial_app.workspace_id','a0d20000-0000-4000-8000-000000000001',true);
  if financial_app.document_detail(v_id)#>>'{document,isTest}'<>'true' then raise exception 'DOC denied write changed record'; end if;
  perform financial_app.set_document_test_designation(v_id,false,'AUD restored ordinary treatment',true);
  if (financial_app.document_list('pending_review',null,1,0)->>'total')::int<>58 then raise exception 'DOC ordinary count not restored'; end if;
  if financial_app.document_list_filtered(null,null,50,0,'tests',false)->>'total'<>'0' then raise exception 'DOC reversal not persisted'; end if;
  if (select count(*) from financial_app.audit_changes where entity_id=v_id and field_name='test_designation')<>2 then raise exception 'DOC reversal history incomplete'; end if;
  if exists(select 1 from aud_doc_originals old join financial_app.documents d using(id)
    where old.original<>to_jsonb(d)-array['is_test','test_designation_updated_at','test_designation_updated_by','test_designation_reason','updated_at']) then
    raise exception 'DOC designation changed original metadata';
  end if;
  if (select count(*) from financial_app.document_transaction_associations)<>0 then raise exception 'DOC designation created associations'; end if;
  if (select count(*) from financial_app.document_ocr_runs)<>0 then raise exception 'DOC designation ran OCR'; end if;
end;
$$;
reset role;
do $$
begin
  if pg_catalog.has_function_privilege('anon','financial_app.set_document_test_designation(uuid,boolean,text,boolean)','execute')
    or pg_catalog.has_function_privilege('authenticated','financial_app.set_document_test_designation(uuid,boolean,text,boolean)','execute')
    or pg_catalog.has_function_privilege('service_role','financial_app.set_document_test_designation(uuid,boolean,text,boolean)','execute') then
    raise exception 'DOC owner confirmation is exposed outside the scoped gateway';
  end if;
end;
$$;
rollback;
select 'AUD_E2E_DOC|status=ok|owner_review=true|reversible=true|workspace_isolated=true|fixtures_rolled_back=true' as result;
