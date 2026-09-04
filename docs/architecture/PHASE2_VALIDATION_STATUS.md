# Financial App 0.0.1 — Fase 2 · Estado de validación

Fecha de actualización: 04/09/2026

## Regla de continuidad

Este documento es un checkpoint técnico acumulativo. No sustituye el Prompt Maestro Axioma Definitivo ni la Fase 1 validada. Ante cualquier corte de chat o sesión, la reanudación debe partir del último estado real de GitHub, Supabase, Vercel y del Gantt oficial, nunca de un resumen incompleto de conversación.

## Estado porcentual oficial

- Fase 1 — Fundamentos: 100% completada; peso 8%; aporte global 8,0%.
- Fase 2 — Lectura e importación de datos: 72% validado; peso 10%; aporte global 7,2%.
- Progreso global validado: 15,2%.
- OCR permanece previsto para Fase 11, tramo global 93%–97%.

El porcentaje no aumenta por commits, tiempo ni volumen de código. Solo aumenta por trabajo real validado.

## Rama y protección acumulativa

- Base cerrada: `main` en la Fase 1 validada.
- Rama activa: `rebuild/phase-2-data-quality`.
- Pull request de continuidad: #287, Draft, sin fusionar mientras Fase 2 siga abierta.
- HEAD validado de código en este checkpoint: `b7763c76f46a09fc5a41a4291203eefca4d17ffe`.
- CI Preview E2E run `33896377379`: `success`.
- Build de producción Next.js: `success`.
- Browser/core-health E2E: `success`.
- Preview Vercel exacto del HEAD: `READY`.
- `/api/health/data-quality`: 20/20, `status=ok`.

## Evidencias ya validadas

### Fuente oficial

- Google Sheet oficial localizado y comprobado exclusivamente en lectura.
- Título: `Movimientos bancarios - fuente`.
- Locale: `es_ES`.
- Zona horaria: `Europe/Madrid`.
- Contrato físico: exactamente 22 columnas.
- Pestañas físicas verificadas:
  - `Cuenta corriente · 3967`
  - `Cuenta ahorro · 2504`

### Productos lógicos históricos

La fuente real demuestra que una pestaña física no equivale necesariamente a un único producto financiero. La pestaña de cuenta corriente contiene histórico mezclado.

Contratos lógicos verificados:

- `Cuenta corriente Openbank · 3967` — activa, checking.
- `Cuenta ahorro Openbank · 2504` — activa, savings.
- `Tarjeta prepago Openbank · 8403` — archivada, ledger técnico `other`.

El motor ya separa pestañas físicas de productos lógicos y prefiere la fila de la pestaña canónica cuando un mismo ID de origen aparece también en una copia histórica incrustada. La regresión específica de productos mixtos está verde.

### Sincronización incremental

Validado mediante regresiones ejecutadas realmente contra PostgreSQL con `BEGIN/ROLLBACK`, sin residuos:

- inserción inicial;
- idempotencia;
- revisiones inmutables de fuente;
- preservación de overrides manuales;
- auditoría de cambios de fuente;
- duplicados reversibles;
- preservación de duplicados confirmados manualmente;
- auditoría no destructiva de filas desaparecidas;
- reaparición de filas sin falsos positivos;
- cursores independientes por pestaña;
- guardia de orden cronológico newest-first;
- fuente original inmutable.

Después de las regresiones se verificaron 0 cuentas, 0 movimientos, 0 registros de fuente y 0 sync runs residuales de prueba.

## Correcciones realizadas en este tramo

1. Corregida la regresión SQL `phase2_incremental_ingestion.sql`, que usaba una referencia ambigua `transaction_id=transaction_id` y por tanto no validaba realmente el motor.
2. Corregido el lector Google para validar las dos pestañas físicas reales mediante `OFFICIAL_SOURCE_SHEET_TITLES`, en lugar de usar las claves lógicas de producto.
3. Corregido `SourceSyncService` para separar pestañas físicas de productos lógicos.
4. Añadida selección autoritativa por pestaña canónica para evitar importar dos veces copias históricas del mismo producto.
5. Añadida representación de la prepago como ledger técnico archivado con saldo inicial cerrado.
6. Añadida y aplicada en Supabase la migración `source_account_lifecycle`.
7. Alineado el nombre/versionado de la migración `sync_cursors_per_sheet` con el historial realmente aplicado en Supabase.
8. Actualizado el gateway de código para validar y propagar `lifecycle` hasta PostgreSQL.

## Gate actualmente pendiente

La Edge Function activa `financial-app-db-gateway` continúa en la versión 10. El código actualizado del gateway está verde en GitHub, pero el conector de Supabase bloqueó la operación de despliegue antes de aplicarla. No se ha sustituido ni degradado la versión activa.

Por tanto, todavía NO se considera validado que una sincronización real cree la prepago directamente como `archived` a través del runtime desplegado.

No se debe aumentar Fase 2 por encima del 72% ni fusionar la PR #287 hasta resolver este gate y ejecutar la importación Google real controlada.

## Gates restantes para cerrar Fase 2

- Alinear runtime Edge Function con el contrato `lifecycle` ya validado en código y PostgreSQL.
- Configurar/verificar OAuth Google real de la aplicación con scopes estrictamente read-only.
- Ejecutar lectura real desde la aplicación contra el Google Sheet oficial.
- Ejecutar primera importación real controlada y contrastar recuentos/productos/saldos.
- Repetir sincronización y demostrar idempotencia real sin duplicados.
- Verificar trazabilidad y ausencia de pérdida de modificaciones manuales.
- Confirmar que la prepago queda archivada y no aparece como cuenta activa ordinaria.
- Reejecutar gates de Fase 1 para demostrar ausencia de regresión.
- Actualizar Gantt final de Fase 2 y cerrar PR solo con todas las evidencias verdes.
