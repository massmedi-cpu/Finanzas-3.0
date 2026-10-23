# REC-G5-344–347 · Certificación privada de los ocho PDF reservados
23/10/2026 · Financial App · PR #619. Protocolo ejecutable programado; **la certificación con ocho PDF reales todavía NO se ha realizado**.

## Separación temporal y código congelado
1. Congelar una HEAD exacta y limpia antes de acceder a los ocho PDF reservados; dejar constancia privada de la selección y de que cada candidato seguía inédito. La herramienta no puede demostrar retroactivamente que no se abrieron antes.
2. Guardar fuera del repositorio el archivo JSON con schemaVersion=1, frozenCommit=SHA completo de 40 hex, selectedDocuments=8 objetos cuyos campos son name y previouslyInspectedBeforeFreeze=false. Los ocho nombres deben ser distintos y disjuntos del registro privado de los 17 previamente inspeccionados.
3. Mantener separado el ledger histórico de 17 documentos (name, sha256, previouslyInspected=true). Su contenido es privado y tampoco debe subir a Notion, Trello o GitHub Actions.
4. Solo después de congelar implementación e inventario, descargar los ocho PDF, revisarlos independientemente y elaborar un segundo JSON GOLD con schemaVersion=1 y documents=8. Cada entrada exige name, sha256 del archivo recibido, reviewedIndependently=true, totalCents, date, issuer, taxBaseCents, taxesCents y lineItems completos (descripción, cantidad, importe unitario, total). No rellenar este GOLD copiando las salidas del OCR.
5. Ejecutar tests/e2e/ocr-g5-private-holdout-local.spec.ts en un checkout local privado proporcionando FINANCIAL_APP_G5_HOLDOUT_DIR, FINANCIAL_APP_G5_HOLDOUT_FREEZE, FINANCIAL_APP_G5_INSPECTION_LEDGER y FINANCIAL_APP_G5_HOLDOUT_EXPECTATIONS. El runner exige HEAD Git exacta, algoritmos limpios, inventario de ocho PDF, huellas SHA-256 y GOLD exacto. Si falla una sola comparación de ocho documentos, G5 sigue bloqueada.

## Garantías
- El runner comprueba selección, ledger y commit antes de leer bytes de ningún PDF del holdout; nunca se ejecuta en GitHub Actions ni está entre los test de CI públicos.
- Sin importación, escritura de banco, subida de documentos, envío a API, nombres en logs, OCR literal, importes o archivos privados en el repositorio. Únicamente recuentos agregados en la prueba local.
- REC-G5-345 valida congelación SHA, ocho archivos distintos, 17 inspeccionados disjuntos y rechazos de entradas incorrectas.
- REC-G5-346 valida el GOLD exacto de ocho PDF y el rechazo de diferencias en impuestos o líneas con datos 100 % inventados.
- REC-G5-347 verifica aislamiento del runner y prohibición de operaciones de red/escritura desde el mismo.
- Las tres regresiones sintéticas están conectadas al gate obligatorio del navegador y al filtro del workflow. Que CI esté verde NO significa que los ocho PDF reales hayan aprobado.

## Estado financiero y publicación
- Auditoría de lectura del 23/10: 3.208 identidades de Sheets frente a 3.188 persistidas, exactamente 18 nuevas en corriente y 2 en ahorro. Las 3.188 persistidas se cotejaron por pestaña/ID, fecha, importe y saldo sin diferencias, y 134 saldos desconocidos se conservaron como null en ambas fuentes. Sin escritura.
- AP1 original inmutable no estaba instalado en Supabase productivo en el último preflight; AP2, G5 real, AP5 con 20 altas, AP7/AP8 y aceptación integral requieren cierre separado.
- No fusionar PR #619 ni publicar hasta completar todas las barreras. Aplicación monousuario, fuente oficial de solo lectura, sin crear servicios de pago. Producción 10.0.103 conservada.