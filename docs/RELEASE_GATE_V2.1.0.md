# Release gate — Finanzas 3.0 V2.1.0

## Alcance
V2.1.0 activa el modelo normalizado de PostgreSQL en paralelo al snapshot JSON. La fuente bancaria sigue siendo de solo lectura y `finance_v3_current`/snapshots se conservan como procedencia y rollback.

## Migración de datos validada
- Fuente actual: 3.135 movimientos.
- Normalizados: 3.135/3.135.
- IDs de origen: conjuntos idénticos.
- Checksum de fuente: idéntico.
- Rango: 2018-11-22 → 2026-08-21.
- Segunda sincronización idempotente: 0 insertados, 0 actualizados, 3.135 sin cambios, 0 desaparecidos.
- Comparación por mes: 0 diferencias en recuento/importes/ingresos/gastos/revisión.
- Histórico sin producto explícito: se conserva mediante `__historical_unassigned__`; no se inventa una cuenta bancaria.

## Exactitud de resumen
Comparación V2.0.2 vs modelo normalizado para 2026-08, aplicando overlay privado:
- movimientos: 24 = 24
- pendientes: 11 = 11
- ingresos: 20,73 € = 20,73 €
- gastos: 728,31 € = 728,31 €
- flujo neto: -707,58 € = -707,58 €
- patrimonio conocido: 1.491,20 € = 1.491,20 €

## Rendimiento y escalabilidad
- `finance_v210_transactions_page`: paginación keyset por fecha/posición/id.
- Página SQL de referencia (75 filas, base actual): ~14 ms dentro de PostgreSQL.
- Movimientos: 100 filas reales por página; filtros y búsqueda se ejecutan en servidor.
- Cuentas y resumen de Inicio ya no recorren el snapshot completo.
- Estado de fuente ya no carga el JSON completo.
- Edge `finanzas-v3-normalized` comprueba `modifiedTime` de Drive y solo fuerza la descarga/parseo del XLSX cuando el archivo cambia.

## Seguridad
- Browser nunca recibe `SUPABASE_SERVICE_ROLE_KEY` ni credenciales Google.
- RPC V2.1: solo `service_role`.
- RLS activo y acceso directo de cliente cerrado.
- `pg_trgm` reside en `extensions`, no en `public`.
- La autenticación privada existente se mantiene; no se crean usuarios ficticios de Supabase Auth.

## Gates antes de merge
- [x] equivalencia de datos y resumen
- [x] sincronización idempotente
- [x] paginación sin solapamientos
- [x] búsqueda SQL smoke
- [x] CI de núcleo: invariantes, regresión, TypeScript, build y smoke
- [x] preview exacto READY en `cdg1`
- [ ] versionado final 2.1.0 + CI final
- [ ] verificación post-merge producción

V2.0.2 permanece disponible como rollback hasta finalizar todos los gates.
