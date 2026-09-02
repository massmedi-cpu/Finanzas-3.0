begin;

-- Financial App 9.0.0 — separar fallo del motor OCR de fallo de validación financiera.
-- Un ticket con texto OCR útil pero estructura financiera no verificable debe seguir
-- pendiente de revisión; `failed` queda reservado para fallos reales de lectura.
-- No se modifica texto, reconstrucción, importe, fecha, comercio ni evidencia OCR.

update financial_app.documents d
set ocr_status='needs_review'
where d.archived_at is null
  and d.ocr_status='failed'
  and coalesce(d.ocr_data->>'method','') like 'image_ocr_receipt_%'
  and coalesce(d.ocr_data->'validation'->>'status','')='failed'
  and length(regexp_replace(coalesce(d.ocr_data->>'rawText',d.ocr_text,''),'\s','','g'))>=8
  and nullif(btrim(coalesce(d.ocr_data->>'error','')),'') is null;

commit;
