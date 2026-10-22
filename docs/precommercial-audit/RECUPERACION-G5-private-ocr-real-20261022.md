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

## REC-G5-307 · reapertura de estratificación con historial de inspección explícito
- Al corregir las categorías FREE NOW / Samsung, PDF ya abiertos pueden superar el límite de desarrollo de su categoría. El selector anterior preseleccionaba **todos** los `previouslyInspected=true` y luego forzaba 16+8, haciendo el conjunto imposible. Ahora reserva hasta la cuota por categoría; los excedentes ya inspeccionados quedan excluidos de **ambos** grupos y jamás se reciclan como holdout.
- Se admite un historial global superior a 16 PDFs abiertos, pero **solo** si todavía existen 8 privados nunca inspeccionados para la reserva, sin duplicados, con las cuotas exactas. La separación se valida de manera estricta. No se renombra un documento abierto a «nuevo».
- La selección real requiere un registro privado explícito `previouslyInspected: true/false` **para cada candidato elegible**; un valor ausente o desconocido detiene la operación. La herramienta no puede asegurar qué PDFs se abrieron históricamente por sí sola; el registro no debe subirse a GitHub ni a CI.
- Nuevo self-test sintético que cubre exceso en transporte/tecnología, 17 inspeccionados, histórico excluido del holdout, falta de estado de inspección y ausencia real de archivos independientes. Sin nombres, PDFs o identificadores privados en las pruebas.
- El objetivo final sigue siendo 16 desarrollo + 8 holdout, como **candidato privado** y no como certificación OCR. Los 8 reservados quedan sin abrir hasta la congelación del extractor.
