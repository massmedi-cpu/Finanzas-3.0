-- Financial App 10.0.90 · hardening de rendimiento OCR
-- Cubre la FK (workspace_id, ocr_run_id) de document_ocr_reviews.
-- Índice aditivo; no modifica datos ni la fuente bancaria.

create index if not exists document_ocr_reviews_workspace_run_idx
  on financial_app.document_ocr_reviews(workspace_id, ocr_run_id);

comment on index financial_app.document_ocr_reviews_workspace_run_idx is
'10.0.90: índice de cobertura para document_ocr_reviews_run_workspace_fkey.';
