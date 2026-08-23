# Release gate · Archive 3.0.4

La promoción requiere CI completo verde, incluyendo audit:ocr, test:ocr, audit:v300, accesibilidad, TypeScript y build de producción.

Además, antes de producción deben existir en Supabase las RPC `financial_app_archive_restore(uuid)` y `financial_app_archive_delete(uuid)` definidas en `database/FINANCIAL_APP_3.0.4_ARCHIVE_MANAGEMENT.sql`.
