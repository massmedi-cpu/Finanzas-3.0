# REC-G5-304/305 · OCR real y corrección del selector privado
Fecha: 22/10/2026. PR #619. Datos de fuente Google Drive tratados de forma privada; no se publican documentos, identificadores, nombres, importes ni imágenes.

## Ensayo efectuado en un entorno privado (no en producción)
- Se descargaron **16 PDF privados reales** clasificados inicialmente como material de desarrollo. Sus **27 páginas muestreadas** (primera y última de cada archivo) se renderizaron localmente y se procesaron con Tesseract en español.
- **16/16 PDF procesados** sin errores. Los importes indicados en los nombres de los documentos se localizaron en el texto nativo del PDF **16/16**; en la salida del OCR visual directo, **10/16**. Este contraste es diagnóstico: no se ejecutó el flujo completo de confirmación ni persistencia de Financial App y no equivale al porcentaje definitivo de acierto del OCR dentro de la aplicación.
- **Ninguno de los 8 archivos destinados a holdout fue descargado ni abierto en esta prueba**. Los documentos de desarrollo nunca se incorporaron a Git, GitHub Actions, Notion, Trello, Supabase ni a la aplicación publicada. No se editaron fuentes ni datos bancarios.
- **Problema de taxonomía constatado** en los nombres de dos documentos legítimos: FREE NOW figuraba como «Otros» aunque era transporte; Samsung figuraba como «Otros» aunque era tecnología. Eso invalida tomar la selección preliminar como corpus G5 estratificado y requiere **replanificar cuotas antes de evaluación holdout**, sin reutilizar material ya abierto como holdout.
- El reporte privado de comprobación se mantiene separado de los datos bancarios. La lectura local de PDF nativo y OCR visual demostró que **recuperar texto completo del PDF antes de OCR de imagen aporta evidencia esencial**, pero no certifica por sí sola el extractor financiero de Financial App.

## Cambio de producto
- El selector `scripts/verify-private-ocr-corpus-selection.mjs` reconoce ahora `FREE NOW/FreeNow/taxi` como transporte y `Samsung/Xiaomi` como tecnología.
- **REC-G5-304:** pruebas sintéticas de aliases nuevos para evitar regresiones.
- **REC-G5-305:** documentos sin señales de factura/ticket/recibo/justificante/compra/pedido se excluyen del conjunto privado aunque sean PDF auténticos. También se preserva la exclusión existente de contratos, pólizas y condiciones.
- El self-test de cuotas y privacidad continúa ejecutándose en la fase obligatoria de navegador; no se añaden originales ni fixtures privados a CI.

## Trabajo pendiente (sin falsa certificación)
1. Reseleccionar y acreditar la distribución exacta 16 desarrollo + 8 holdout respetando los PDFs ya inspeccionados.
2. Ejecutar el motor y el formulario de Financial App con originales locales controlados, revisar fecha, emisor, total, IVA, líneas y relación documento-movimiento; comparar contra expectativas independientes.
3. Ejecutar holdout solo después de congelar el selector y el extractor; no abrir sus originales durante la preparación.
4. Confirmar que preview/productivo conservan autenticación y nunca importan documentos o movimientos sin consentimiento/validación previa.

El commit anterior `3d6d3f99` tenía 84/87 workflows PASS y 2 todavía en curso al momento de iniciar este bloque; comprobar la CI completa por el SHA exacto de cualquier nuevo commit.

## Integridad de la CI (REC-G5-306)
La ruta `scripts/verify-private-ocr-corpus-selection.mjs` queda añadida explícitamente al filtro de cambios que dispara `.github/workflows/product-recovery-ui.yml`. El guard de la suite exige esa ruta: así el selector nunca conserva una certificación verde obsoleta al cambiar categorías o admisión de PDF. El self-test sigue siendo 100 % sintético sin originales bancarios o facturas privadas.
