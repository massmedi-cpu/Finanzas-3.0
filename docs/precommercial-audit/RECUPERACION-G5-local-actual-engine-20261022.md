# REC-G5-315/316 · Prueba local real del OCR financiero

A diferencia de una búsqueda de importes con pdftotext, `tests/e2e/ocr-g5-private-development-local.spec.ts` utiliza el lector `PdfTextOcrProvider`, la reconstrucción `runDocumentOcr` y el intérprete `interpretDocumentOcrFinancially` reales de Financial App.

Solo se ejecuta expresamente en un entorno local donde se encuentren los **17 PDF previamente inspeccionados**: `FINANCIAL_APP_G5_DEVELOPMENT_DIR=<directorio privado> npx playwright test tests/e2e/ocr-g5-private-development-local.spec.ts --project=chromium-desktop`.

No recorre subcarpetas, nunca abre los **8 documentos reservados**, y no imprime nombres, importes, errores PDF originales, páginas, rutas ni identificadores. Únicamente registra totales agregados: éxito/error técnico, origen PDF nativo/visual, total reconocido, confianza, fecha, emisor y acierto respecto al importe incluido en el nombre (este último es solo una pista, NO verdad financiera auditada).

La prueba `REC-G5-316`, añadida a la suite CI general, certifica el **contrato de privacidad del corredor**, NO la exactitud de los documentos privados ni un G5 final. G5 solo podrá cerrarse después de revisar campos contra los originales, congelar la versión y ejecutar entonces la muestra holdout independiente. Nunca subir PDFs al repositorio ni utilizar datos ficticios como métricas de aceptación.

La fuente Google Sheets, Supabase productivo y la publicación permanecen estrictamente intactas.
