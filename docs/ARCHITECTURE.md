# Arquitectura canónica — Finanzas 3.0 V2.1.0

## Flujo de datos

`Google Drive / XLSX maestro (solo lectura)` → `finanzas-v3-bridge` → `finance_v3_current + snapshots` → `finanzas-v3-normalized` → tablas `finance_*` normalizadas → Next.js/Vercel.

El snapshot JSON se conserva como procedencia, validación y rollback, pero deja de ser el mecanismo obligatorio de lectura de las superficies migradas.

## Sincronización eficiente

`finanzas-v3-normalized` V3 valida la sesión privada y comprueba como máximo una vez por minuto el `modifiedTime` de Drive. Si el archivo no cambió, no descarga ni parsea el XLSX. Si cambió, fuerza al bridge a actualizar el snapshot y ejecuta `finance_v210_sync_current_snapshot` antes de servir datos normalizados.

La normalización es idempotente y conserva versiones de transacciones. Un cambio de fuente nunca edita el XLSX original.

## Identidad financiera

La aplicación actual no usa Supabase Auth. V2.1.0 introduce `finance_principals` como identidad de dominio y mantiene `auth_user_id` opcional para una futura integración. Las tablas normalizadas referencian al principal financiero y la sesión privada actual sigue siendo la autoridad de acceso.

## Modelo normalizado

Principales tablas activadas:
- `finance_sources`
- `finance_accounts`
- `finance_source_transactions`
- `finance_source_transaction_versions`
- `finance_transaction_enrichments`
- `finance_transfer_links`
- `finance_review_items`
- `finance_rules`
- `finance_alerts`
- `finance_sync_runs`
- `finance_audit_events`

La capa editable ya validada continúa en:
- `finance_v3_movement_overrides`
- `finance_v3_movement_splits`
- `finance_v3_budgets`
- `finance_v3_goals`
- `finance_v3_future_events`
- `finance_v3_scenarios`
- `finance_v3_recurring_preferences`

## Superficies V2.1 migradas

### Movimientos
- bootstrap compacto desde SQL;
- paginación keyset de 100 filas;
- búsqueda/filtros en servidor;
- overrides y splits resueltos en la consulta;
- edición sigue escribiendo únicamente en el overlay privado.

### Cuentas
Lee el último saldo conocido desde el modelo normalizado; no recorre miles de movimientos.

### Inicio
`SourceHealth` y `FinancialSummary` usan estado/resumen normalizado. El resumen se ha comparado contra el cálculo V2.0.2 con equivalencia exacta.

`DashboardInsights` y análisis históricos avanzados permanecen deliberadamente sobre el motor validado anterior en V2.1.0; su migración compacta y equivalente es el objetivo principal de V2.2.0.

## Frontera de confianza

El navegador nunca recibe credenciales de Google ni `SUPABASE_SERVICE_ROLE_KEY`. Las llamadas desde el navegador a movimientos pasan por una API Next privada. Edge Functions usan service-role solo después de validar el token privado.

Las RPC `finance_v210_*` no son ejecutables por `anon` ni `authenticated`. RLS permanece habilitado. `pg_trgm` está instalado en `extensions`, no en `public`.

## Plataforma

- Next.js 16.3.1 / React 19.2.8.
- Node 22.x.
- Vercel `cdg1` próximo a Supabase `eu-west-3`.
- Dependencias directas fijadas y lockfile npm v3.
- CI: invariantes → regresión financiera → TypeScript → build → smoke del servidor compilado.
- Producción: smoke adicional después de cada merge a `main`.

## Escalabilidad

V2.1.0 elimina el requisito de transportar el snapshot de ~2,2 MB para Movimientos, Cuentas y el resumen/estado de Inicio. El coste del listado queda acotado por el tamaño de página y no por el tamaño histórico. V2.2.0 extiende el mismo principio a calidad, recurrentes, previsión, informes, presupuestos y Plan.
