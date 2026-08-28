begin;

-- Financial App 6.4.5 · compatibilidad del nombre real usado en Drive.
-- No crea un segundo motor de matching: completa metadatos de ingesta antes de
-- que el matching documental 6.x reciba el documento.
-- Formato real protegido: 20250826 Mercadona 23,49 €.pdf

create or replace function financial_app.drive_document_rows(p_files jsonb)
returns table(
  drive_id text,
  file_name text,
  mime_type text,
  storage_url text,
  folder_path text,
  modified_time text,
  document_type text,
  document_date date,
  amount numeric,
  merchant text,
  file_size bigint
)
language sql
immutable
set search_path = pg_catalog
as $$
  with raw as (
    select
      nullif(btrim(x.id),'') as drive_id,
      nullif(btrim(x.name),'') as file_name,
      nullif(btrim(x."mimeType"),'') as mime_type,
      coalesce(nullif(btrim(x."webViewLink"),''),'https://drive.google.com/file/d/'||nullif(btrim(x.id),'')||'/view') as storage_url,
      nullif(btrim(x."folderPath"),'') as folder_path,
      nullif(btrim(x."modifiedTime"),'') as modified_time,
      nullif(btrim(x."documentType"),'') as source_document_type,
      nullif(btrim(x."documentDate"),'') as source_document_date,
      nullif(btrim(x.amount),'') as source_amount,
      nullif(btrim(x.merchant),'') as source_merchant,
      nullif(btrim(x.size),'') as source_size,
      regexp_replace(coalesce(nullif(btrim(x.name),''),''),'\.[^.]+$','','') as stem
    from jsonb_to_recordset(p_files) as x(
      id text,
      name text,
      "mimeType" text,
      "modifiedTime" text,
      size text,
      "webViewLink" text,
      "folderPath" text,
      "documentType" text,
      "documentDate" text,
      amount text,
      merchant text
    )
  ), parsed as (
    select
      raw.*,
      regexp_match(stem,'^(20[0-9]{2})-?([0-9]{2})-?([0-9]{2})([[:space:]_-]|$)') as filename_date_parts,
      regexp_match(stem,'(-?[0-9][0-9. ]*(,[0-9]{2}|\.[0-9]{2}))[[:space:]]*(€|EUR)[[:space:]]*$','i') as filename_amount_parts,
      case
        when stem ~ '^20[0-9]{6}([[:space:]_-]|$)' then
          nullif(
            btrim(
              regexp_replace(
                regexp_replace(stem,'^20[0-9]{6}[[:space:]_-]*','',''),
                '[[:space:]]+-?[0-9][0-9. ]*(,[0-9]{2}|\.[0-9]{2})[[:space:]]*(€|EUR)[[:space:]]*$','','i'
              )
            ),
            ''
          )
        else null
      end as compact_filename_merchant
    from raw
  ), normalized as (
    select
      parsed.*,
      case
        when filename_date_parts is not null then
          filename_date_parts[1]||'-'||filename_date_parts[2]||'-'||filename_date_parts[3]
        else null
      end as filename_date_text,
      case
        when filename_amount_parts is null then null
        when position(',' in filename_amount_parts[1])>0 then
          replace(replace(replace(filename_amount_parts[1],' ',''),'.',''),',','.')
        else replace(filename_amount_parts[1],' ','')
      end as filename_amount_text
    from parsed
  ), q as (
    select
      drive_id,
      file_name,
      mime_type,
      storage_url,
      folder_path,
      modified_time,
      case
        when source_document_type in ('invoice','receipt','contract','statement','tax','other') then source_document_type
        else 'other'
      end as document_type,
      case
        when source_document_date is not null and pg_input_is_valid(source_document_date,'date') then source_document_date::date
        when filename_date_text is not null and pg_input_is_valid(filename_date_text,'date') then filename_date_text::date
        else null
      end as document_date,
      case
        when source_amount is not null and pg_input_is_valid(replace(source_amount,',','.'),'numeric') then replace(source_amount,',','.')::numeric
        when filename_amount_text is not null and pg_input_is_valid(filename_amount_text,'numeric') then filename_amount_text::numeric
        else null
      end as amount,
      coalesce(compact_filename_merchant,source_merchant) as merchant,
      case
        when source_size is not null and pg_input_is_valid(source_size,'bigint') then source_size::bigint
        else null
      end as file_size
    from normalized
  )
  select distinct on (q.drive_id)
    q.drive_id,
    q.file_name,
    q.mime_type,
    q.storage_url,
    q.folder_path,
    q.modified_time,
    q.document_type,
    q.document_date,
    q.amount,
    q.merchant,
    q.file_size
  from q
  where q.drive_id is not null and q.file_name is not null
  order by q.drive_id, q.modified_time desc nulls last, q.file_name
$$;

-- Sigue siendo una función interna. La Edge Function la consume indirectamente
-- a través del core de importación con service_role.
revoke all on function financial_app.drive_document_rows(jsonb) from public,anon,authenticated,service_role;

commit;
