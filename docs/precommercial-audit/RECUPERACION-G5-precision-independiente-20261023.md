# Financial App · REC-G5-340–343 · Protocolo privado de precisión OCR
Fecha: 23/10/2026. Candidata PR #619. **No equivale a G5 real certificado.**

## Por qué cambia
El ensayo anterior verificaba lectura sin excepción y cotejaba en ocasiones el importe contra una pista del nombre del archivo. Ninguna métrica comprueba de forma independiente fecha, emisor, total, IVA/base ni líneas. No certificar OCR financiero por el mero hecho de extraer un PDF.

## Garantías programadas
- Un nuevo módulo puro exige manifiesto GOLD **local** con 17 filas exactas: cada nombre y SHA-256 deben corresponder a los 17 documentos del ledger de inspección anterior, sin colar ninguno de los ocho reservados.
- Cada fila necesita declaración independiente y valores explícitos de total en céntimos, fecha, emisor, base imponible, impuestos y el detalle financiero de **cada línea** (descripción, cantidad, precio unitario e importe). Ausencias verificadas se representan con null. No se admiten importes no enteros, identidades duplicadas, estados desconocidos ni campos de más; un mero número de líneas nunca da un PASS.
- El ejecutor local de Financial App requiere las variables FINANCIAL_APP_G5_DEVELOPMENT_DIR, FINANCIAL_APP_G5_INSPECTION_LEDGER y FINANCIAL_APP_G5_EXPECTATIONS. Se omite siempre en GitHub Actions. Primero verifica la integridad del ledger y 17 hashes de PDF, después el manifiesto independiente y solo entonces ejecuta el OCR real.
- El extractor y el intérprete financieros se cotejan contra expectativas independientes campo por campo, incluida igualdad de longitud, orden, descripción normalizada, cantidad, precio unitario e importe de cada línea: se exigen 17 aciertos y 0 errores de extracción. Se publican solo recuentos, nunca nombres, identificadores, OCR literal, importes ni imágenes.
- Tests sintéticos REC-G5-340/341/342 en CI comprueban contrato, privacidad y rechazo de resultados financieros incorrectos. Pasarlos **no certifica PDFs auténticos**.

## Formato de una entrada GOLD (ejemplo 100 % inventado)
schemaVersion: 1; documents: una lista de exactamente 17 objetos, cada uno con:
name: synthetic-example.pdf; sha256: 64 caracteres hexadecimales; reviewedIndependently: true; totalCents: 1245; date: 2026-10-23; issuer: Emisor sintético; taxBaseCents: 1000; taxesCents: 245; lineItems: [{description: Producto de prueba, quantity: 1, unitPriceCents: 1245, totalCents: 1245}].
El archivo GOLD auténtico debe custodiarse fuera de Git/Notion/Trello/CI y elaborarse mediante revisión independiente del PDF, no copiando cifras de salida OCR ni importes del nombre. El ejemplo no constituye un archivo ejecutable ni evidencia G5.

## Estado y dependencias
- Las modificaciones están versionadas en PR #619, pero requieren CI terminal del HEAD exacto; no proyectar los resultados verdes de un commit anterior.
- No se han abierto los ocho holdout. Continúa sin estar reconstruido con garantías el registro privado de 17 revisados/8 inéditos. Sin ese registro y la revisión GOLD no hay certificación G5 real.
- AP1 original productivo, 20 altas bancarias, AP2/AP5/AP7/AP8 y aceptación final siguen pendientes. No modificar fuente Google Sheets, datos bancarios, documentos originales, Supabase live, infraestructura de pago ni producción 10.0.103.