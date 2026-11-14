# REC-SYNC-357 · Bloqueo transaccional de revisiones históricas (23/10/2026)

## Motivo verificado en código

El POST de sincronización ya exige contrato de gateway v3, un preflight fresco y
lectura completa anterior y posterior. Pero el gateway `source.sync_batch`
seguía permitiendo la acción `append_revision` devuelta por la función SQL
`ingest_source_observation`. Dos solicitudes concurrentes o una modificación
entre la lectura anterior y el lote podían, en teoría, alterar una fila histórica
antes de que el postflight detectase el problema. No es evidencia de que
haya ocurrido una alteración de datos reales.

## Cambio seguro en candidata

- La única disposición aceptada para el importador oficial es `insert` o
  `skip`. `append_revision` ahora lanza `source_existing_rows_changed`
  dentro de la misma transacción `sql.begin`, abortando todo el lote:
  movimientos nuevos, revisiones históricas, mappings y cursores.
- La auditoría de fallo posterior a rollback se conserva separada y no
  representa una importación correcta.
- El gateway devuelve 409 con código público
  `google_source_existing_rows_changed`; la API Next.js lo transmite
  como 409 sin valores bancarios ni SQL. No hay reintento automático.
- La regresión REC-SYNC-357 prueba acciones válidas y rechazadas,
  ubicación del guard dentro de la transacción y mapeo de error.

## Alcance y límites

Este bloqueo del lote es adicional al preflight/postflight; no hace atómica
la lectura de Google y la de PostgreSQL, ni demuestra por sí solo la
efectividad de permisos directos de otras rutas. Tampoco cambia la función
SQL global de ingestión para revisiones que pudieran tener un uso
independiente del importador oficial.

**Pendiente:** CI terminal de SHA exacta, AP1 original inmutable productivo,
AP2 dos identidades cloud, G5 corpus privado y prueba de sincronización
controlada con respaldo, comparación de las 22 columnas y decisión explícita
sobre la representación de fecha divergente. No tocar fuente Google Sheets,
3.188 registros productivos, los 20 nuevos pendientes, PR draft ni Vercel
Producción 10.0.103. Ninguna afirmación de pruebas cloud hasta resultados.
