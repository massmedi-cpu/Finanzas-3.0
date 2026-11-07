# REC-OCR-320–328 · Totales por página y lectura incompleta

Fecha: 22/10/2026. Candidata acumulativa de PR #619, sobre `48292490411a547cf32950c08bb00e200e31e76c`. La aplicación continúa siendo personal; no se exige una segunda identidad humana.

## Problema y comportamiento corregido

Una factura con `TOTAL PÁGINA 12,10` podía presentar 12,10 como total financiero fiable. Además, esa etiqueta en la capa seleccionable de un PDF híbrido podía impedir la recuperación visual del importe impreso en la imagen. Una lectura con páginas omitidas o fallidas conservaba importes agregados marcados como fiables aunque el documento estuviese incompleto.

- El intérprete excluye subtotales de página, hoja, importes anteriores y cantidades transportadas, conservando intactos texto, geometría y evidencias originales. En una fila PDF fusionada, la exclusión termina antes de otra etiqueta de total: no elimina el total legítimo ni toma prestado un subtotal para una etiqueta vacía.
- La política PDF aplica la misma distinción al decidir si necesita lectura visual y al comparar el resultado nativo con el visual. Un subtotal no protege una capa incompleta frente a OCR; un verdadero total nativo sigue teniendo prioridad.
- Si existe aviso de páginas omitidas, límite de páginas, página ilegible o recuperación visual incompleta, base, impuestos y total conservan sus valores observados pero pasan a `doubtful`. No se deducen agregados fiscales a partir de una tabla parcial. La recuperación visual satisfactoria y la corrección de orientación, por sí solas, no declaran incompleto el documento.
- Documentos explica: «Faltan páginas por leer o recuperar. La base, los impuestos y el total necesitan revisión con el original completo». La revisión prioriza el total y no confirma datos automáticamente.

## Evidencias locales sobre el árbol de este commit

| Control | Resultado y alcance |
| --- | --- |
| `npm run typecheck` | PASS. |
| `npm run build` y postbuild | PASS con caché de compilación limpia; todos los guards acumulativos ejecutados. |
| `npx playwright test --config=playwright.ocr.config.ts` | **253 PASS, 0 FAIL, 0 SKIP**. Incluye motor OCR real sobre imágenes/PDF sintéticos, geometría, interpretación, límites y recuperación. No es un corpus privado de precisión. |
| `node scripts/test-ocr-amount-label-selection.mjs` | **79/79 PASS**, expectativas sintéticas independientes de importes y tablas fiscales. |
| Interfaz y PDF fallidos, build optimizada, escritorio/móvil | **22 PASS, 6 SKIP, 0 FAIL** en `document-ocr-natural-review.spec.ts`, `document-ocr-pdf-failures.spec.ts` y `data-trust.spec.ts`. Los seis SKIP son pruebas PDF preexistentes que se ejecutan una sola vez en escritorio; la revisión visible nueva pasa en ambos tamaños. |
| `node scripts/verify-recovery-visual-suite-gate.mjs` | PASS. Los casos 320–328 y la recuperación PDF híbrida quedan incorporados al gate obligatorio; cambiar la política PDF vuelve a dispararlo. |
| Integridad del diff | Sin errores de espacios ni originales privados, registros de inspección, credenciales o datos bancarios reales añadidos. |

Se reprodujeron primero tres regresiones fallidas del intérprete y una del selector PDF sobre el código previo. El caso 325 ejecuta realmente `PdfTextOcrProvider` → PDF.js → Tesseract español → `runDocumentOcr` → intérprete financiero: una imagen sintética con 23,45 se recupera bajo una capa seleccionable que contiene un subtotal de 12,10. El caso 326 recorre la interfaz real con API aislada, comprueba el aviso en español, los tres campos dudosos, ausencia de confirmación automática y ausencia de desbordamiento horizontal.

El primer ensayo local de navegador falló al reutilizar contextos de un Chromium ejecutado en un solo proceso; la repetición completa con procesos separados pasa sin cambiar pruebas ni código de producto. Un intento de build reutilizando caché falló al abrir la persistencia de Turbopack; la compilación limpia posterior y sus postbuild pasan. No se trasladan esos fallos del entorno a producción ni se ocultan como éxitos iniciales.

## Estado de entrega y límites

- Baseline `48292490`: **88 workflows terminales, 87 SUCCESS y 1 SKIPPED**, comprobados por API pública de GitHub. La omisión es el job histórico de backup de otra PR; no certifica el commit nuevo. La nueva CI debe evaluarse por su SHA exacto.
- Producción comprobada mediante `GET https://financialapp-home.vercel.app/api/build`: HTTP 200, versión **10.0.103**, commit `6dad59c6c2db3575618a7c91c49c3060a93bbba1`, entorno `production`, deployment `dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5`.
- La PR acumulativa permanece en borrador. Este bloque no constituye una publicación ni acredita las puertas de aceptación restantes.
- Los 17 PDF de desarrollo y su registro privado de inspección no se encuentran en este entorno. No se inventa ese registro ni se abren documentos de reserva para sustituirlos. **G5 real sigue abierto**, incluida revisión independiente y holdout congelado.
- El último estado canónico conserva pendientes respaldo fresco, salvaguarda de originales y gateway antes de sincronizar las 20 observaciones, conciliación posterior y publicación final. En este bloque no se ha ejecutado ninguna escritura financiera ni migración.
- Trello devolvió timeout en la búsqueda del tablero y en la lectura de su tarjeta canónica; no se afirma actualización remota de esa tarjeta sin respuesta verificable.
