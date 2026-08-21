# Arquitectura canónica — Finanzas 3.0 V3.0.0

## Flujo de datos

`Google Drive / XLSX maestro (solo lectura)` → `finanzas-v3-bridge` → `finance_v3_current + snapshots` → `finanzas-v3-normalized` → tablas `finance_*` normalizadas → RPC analíticas/privadas → Edge Functions → Next.js/Vercel.

El snapshot JSON se conserva como procedencia, validación y rollback. Las superficies de producto migradas no dependen de transportar el histórico completo.

## Sincronización
`finanzas-v3-normalized` valida la sesión privada, comprueba `modifiedTime` de Drive con caché corta y solo fuerza descarga/reparseo cuando la fuente cambia. `finance_v210_sync_current_snapshot` es idempotente y conserva versiones. El XLSX original nunca se edita.

## Identidad y frontera de confianza
`finance_principals` representa la identidad financiera de dominio y permite mantener la sesión privada actual sin acoplarla a Supabase Auth. El navegador no recibe credenciales Google ni `SUPABASE_SERVICE_ROLE_KEY`.

Las tablas privadas usan RLS deny-by-default. Las operaciones privilegiadas se ejecutan exclusivamente desde Edge Functions tras validar la sesión privada. En V3.0 las funciones históricas `data`, `recurring` y `splits` también son fail-closed: solo 2xx o el 404 autenticado esperado del probe legado autorizan; cualquier 5xx, 401/403 o fallo de red deniega.

## Capas de datos

### Fuente/normalización
- `finance_sources`
- `finance_accounts`
- `finance_source_transactions`
- `finance_source_transaction_versions`
- `finance_sync_runs`
- `finance_audit_events`

### Capa privada editable
- `finance_v3_movement_overrides`
- `finance_v3_movement_splits`
- `finance_v3_budgets`
- `finance_v3_goals`
- `finance_v3_future_events`
- `finance_v3_scenarios`
- `finance_v3_recurring_preferences`
- `finance_v3_classification_rules`
- `finance_v3_month_closures`
- `finance_v3_system_audits`
- `finance_v3_private_backups`

La precedencia efectiva de clasificación es `split > manual > regla > fuente`.

## Analítica
`finance_v220_effective_rows` resuelve overlays, reglas, exclusiones, traspasos y splits antes de agregar. Informes, Presupuestos, Revisión, Plan, Previsión e Inicio consumen resultados compactos SQL.

Movimientos usa paginación keyset/cursor. El histórico no se renderiza ni se transporta de una sola vez.

## Planificación
El motor de largo horizonte proyecta hasta 60 meses por ventanas de 12 meses, deduplica ocurrencias y alimenta calendario mensual, resumen anual, escenarios y capacidad de objetivos. Los cálculos de objetivos y prioridades son deterministas y están cubiertos por regresiones.

## Cierre y control
- Cierre mensual persistente/reabrible con snapshot y detección de drift.
- Centro de Control con checksum, sincronización, calidad e inventario de capas privadas.
- Reglas con preview obligatorio y explicabilidad.
- Backup privado portable sin incluir la fuente bancaria; restore transaccional condicionado a compatibilidad de checksum, filas y referencias.

## Edge Functions V3
- `finanzas-v3-bridge`
- `finanzas-v3-data`
- `finanzas-v3-recurring`
- `finanzas-v3-splits`
- `finanzas-v3-normalized`
- `finanzas-v3-analytics`
- `finanzas-v3-closure`
- `finanzas-v3-rules`
- `finanzas-v3-explainability`
- `finanzas-v3-control`
- `finanzas-v3-backup`

## Plataforma y release
- Next.js / React con Node 22.
- Vercel región `cdg1`; Supabase `eu-west-3`.
- Dependencias fijadas y lockfile npm v3.
- CI: invariantes → regresiones financieras/funcionales/seguridad → TypeScript → build → smoke del servidor compilado.
- Release V3.0: un único preview del HEAD final, health 3.0.0, runtime limpio y promoción posterior a producción.

## Rollback
Cada fase conserva checkpoints Git. La fuente bancaria no se modifica y la capa privada dispone además de exportación/checkpoints/restauración V2.9+, por lo que rollback de código y recuperación de datos privados son mecanismos separados.
