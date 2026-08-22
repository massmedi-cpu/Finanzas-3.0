# LEGACY — Release gate Finanzas 3.0 V2.1.0 previo al reinicio

> Documento histórico conservado solo para trazabilidad. **No rige Financial App 2.1.0 actual, no debe ejecutarse como roadmap y no sustituye al Prompt Maestro/Axioma vigente.**

## Alcance histórico
V2.1.0 activaba el modelo normalizado de PostgreSQL en paralelo al snapshot JSON. La fuente bancaria seguía siendo de solo lectura y `finance_v3_current`/snapshots se conservaban como procedencia y rollback.

## Migración de datos que constaba como validada
- Fuente: 3.135 movimientos.
- Normalizados: 3.135/3.135.
- IDs de origen: conjuntos idénticos.
- Checksum de fuente: idéntico.
- Rango: 2018-11-22 → 2026-08-21.
- Segunda sincronización idempotente: 0 insertados, 0 actualizados, 3.135 sin cambios, 0 desaparecidos.
- Comparación por mes: 0 diferencias en recuento/importes/ingresos/gastos/revisión.
- Histórico sin producto explícito: `__historical_unassigned__`.

## Exactitud de resumen histórica
Comparación V2.0.2 vs modelo normalizado para 2026-08, aplicando overlay privado:
- movimientos: 24 = 24
- pendientes: 11 = 11
- ingresos: 20,73 € = 20,73 €
- gastos: 728,31 € = 728,31 €
- flujo neto: -707,58 € = -707,58 €
- patrimonio conocido: 1.491,20 € = 1.491,20 €

## Rendimiento y escalabilidad históricos
- `finance_v210_transactions_page`: paginación keyset por fecha/posición/id.
- Página SQL de referencia: 75 filas.
- Movimientos: 100 filas por página; filtros y búsqueda en servidor.
- Cuentas y resumen de Inicio ya no recorrían snapshot completo.
- Edge `finanzas-v3-normalized` comprobaba `modifiedTime` de Drive antes de descargar/parsear XLSX.

## Seguridad histórica
- Browser sin `SUPABASE_SERVICE_ROLE_KEY` ni credenciales Google.
- RPC V2.1 solo `service_role`.
- RLS activo.
- `pg_trgm` en `extensions`.

Este documento quedó obsoleto tras el reinicio que desembocó en Financial App 2.0.0/2.0.1.
