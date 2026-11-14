# REC-SYNC-358–360 · Replay completo y bloqueo de concurrencia (23/10/2026)

## Auditoría reproducible

La ruta `source-sync-router.ts` interceptaba `source.sync_batch` antes del importador normal para reconocer una revisión idéntica. Su comparación comprobaba solo los identificadores y las huellas de las filas suministradas. No exigía que el conjunto completo de registros persistidos careciera de filas adicionales. Tampoco comprobaba en esa vía la cuenta, fecha, importe y saldo guardados. El importador normal y la repetición tomaban caminos diferentes: el lock transaccional solo existía en replay. Son riesgos de código identificados; no representan fraude observado ni alteración de producción.

## Cambios en candidato

- **REC-SYNC-358:** nueva preparación de prueba determinista (máx. 10.000 filas), rechazo de identidades duplicadas, cuentas no mapeadas, fechas inválidas, valores monetarios inseguros y revisiones ausentes. No añade datos bancarios a logs.
- **REC-SYNC-359:** bajo un único snapshot SQL, cuenta todas las filas persistidas del libro además de las emparejadas y compara explícitamente identidad, SHA-256, cuenta, fecha, importe y saldo nulo/exacto. Con filas adicionales, faltantes o alteradas, no se crea recibo de replay. No se aplica una equivalencia implícita a la discrepancia de Fecha.
- **REC-SYNC-360:** el lote ordinario y la vía de replay comparten el mismo advisory lock de PostgreSQL dentro de la transacción y antes de la primera escritura. El rollback de revisiones históricas sigue vigente (REC-SYNC-357).
- `product-recovery-ui.yml` incluye expresamente el router y el nuevo preparador entre los cambios que deben iniciar CI. La matriz integrada de escritorio y móvil y su guard obligatorio exigen las cuatro regresiones 357–360.

## Alcance de la prueba

Las regresiones de contrato son sintéticas, y la consulta SQL exacta debe pasar el gate de CI del commit creado. Esta auditoría no certifica por sí sola ausencia de carreras con otros escritores externos ni despliegue del Edge Function. Las lecturas de Google Sheets y PostgreSQL siguen siendo secuenciales y no atómicas entre sistemas.

**Prohibido hasta gates independientes:** publicar, fusionar, desplegar gateway v3, ajustar en silencio la celda Fecha de la fuente, repetir un POST incierto o importar las 20 altas reales. AP1 productivo, AP2 cloud real y G5 originales reservados pendientes.
