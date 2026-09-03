# Supabase blueprints — Financial App

Estos SQL nacieron como blueprints previos a la creación del Supabase dedicado. Desde el 03/09/2026 la estructura ya está materializada y validada en el proyecto exclusivo `financial-app` (`btzukbfesxdratqnxuoj`).

## Historial oficial aplicado

El historial remoto de Supabase contiene:

1. `20260903200004_financial_app_foundations`
2. `20260903200023_source_snapshot_history`
3. `20260903200134_harden_function_search_paths`
4. `20260903200201_index_foreign_keys`

Los archivos equivalentes están sincronizados en `supabase/migrations/`.

## Estado de validación

- Suite `supabase/tests/foundation_integrity.sql`: ejecutada contra PostgreSQL real y superada dentro de transacción con rollback.
- Security Advisor: 0 lints tras fijar `search_path`.
- Performance Advisor: las FKs inicialmente no cubiertas quedaron indexadas; solo aparecen avisos de índices no usados, esperables en una base nueva sin datos reales.
- Fuente bancaria: protegida contra `UPDATE` y `DELETE` también para `service_role`.
- `anon` y `authenticated`: sin `USAGE` sobre el esquema `financial_app` y sin privilegios directos de tabla.

Los blueprints se conservan como referencia histórica de diseño. Cualquier cambio futuro debe hacerse mediante nuevas migraciones acumulativas; no se deben reescribir las migraciones ya aplicadas.
