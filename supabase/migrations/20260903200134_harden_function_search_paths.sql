alter function financial_app.normalize_label(text)
  set search_path = pg_catalog, financial_app;

alter function financial_app.touch_updated_at()
  set search_path = pg_catalog, financial_app;

alter function financial_app.validate_category_parent()
  set search_path = pg_catalog, financial_app;

alter function financial_app.protect_bank_source_record()
  set search_path = pg_catalog, financial_app;
