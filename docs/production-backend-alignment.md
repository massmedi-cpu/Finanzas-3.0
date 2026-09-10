# Financial App · alineación segura del backend de Production

Estado de diseño: **preparado, no ejecutado**.

Este runbook existe porque la release web 10.0.2 quedó por delante del backend real de Supabase. No autoriza cambios de Production por sí mismo y no modifica la política comercial de borrado.

## Invariantes

- `main`/Vercel Production permanece en 10.0.2 hasta superar todos los gates.
- La fuente bancaria oficial sigue siendo de solo lectura para runtime.
- Los ficheros externos de Google Drive nunca se borran como parte de workspace deletion.
- `workspace-deletion` permanece `not_available` en Data Trust/UI.
- `workspace_deletion_runtime_policy.execution_enabled` debe quedar `false` después de la alineación.
- No se define ni se inventa una política de retención durante este corte.
- No se usa `supabase db push` para reconciliar Production: el historial remoto contiene migraciones equivalentes con timestamps distintos.
- Las migraciones pendientes se aplican explícitamente por **nombre + SQL exacto**, en orden.

## Frontera verificada antes del corte

- Supabase Production tiene 47 migraciones registradas hasta `pre007_forecast_write_integrity`.
- 30 coinciden también por timestamp con el repositorio.
- 17 coinciden por nombre/efecto pero no por timestamp. Véase `ops/backend-alignment/production-migration-reconciliation.json`.
- PRE-001, PRE-020 y CR-001 no están aplicadas todavía en la base real.
- La Edge Function activa `financial-app-db-gateway` es anterior a PRE-001/PRE-020.
- Las precondiciones de tenancy, integridad bancaria y unicidad se comprobaron en modo de solo lectura y no presentan conflictos conocidos.

## Por qué hace falta un gateway puente

La migración `pre001_workspace_tenancy` crea `workspaces`, `workspace_memberships` y el ownership inicial, pero todavía no crea el rol `financial_app_gateway`.

El gateway final validado sí exige `SET ROLE financial_app_gateway`; por tanto no puede instalarse inmediatamente después de tenancy. A su vez, activar RLS antes de sustituir el gateway antiguo dejaría al runtime sin contexto de workspace.

El artefacto `ops/backend-alignment/workspace-context-rollout-bridge.ts.template` resuelve esa transición. Se carga como `workspace-context.ts` únicamente durante el despliegue temporal:

1. Después de tenancy, resuelve membership y fija GUCs, pero conserva temporalmente el principal legacy si todavía no existe el marcador de aislamiento.
2. En cuanto aparece `financial_app.require_current_workspace_id()` y existe `financial_app_gateway`, cambia automáticamente a `SET ROLE financial_app_gateway`.
3. Si aparece el marcador de aislamiento pero falta el rol, falla cerrado.
4. Si el rol aparece parcialmente y no tiene permisos suficientes, la petición falla cerrada; nunca se inventa un fallback posterior al aislamiento.
5. Tras completar las migraciones se sustituye el puente por el gateway final estricto del SHA validado.

El puente es un artefacto operativo temporal; no debe convertirse en el `workspace-context.ts` permanente.

## Secuencia de corte propuesta

### Gate 0 · congelación

- No desplegar otros cambios de backend durante el corte.
- Registrar SHA web, versión Edge y frontera de migraciones antes de empezar.
- Confirmar que la UI de borrado sigue no disponible.

### Gate 1 · backup recuperable

- Ejecutar el workflow de backup de Production ya existente.
- Exigir `pg_dump` correcto, validación del archivo y SHA-256 del artefacto.
- No continuar si el backup no puede recuperarse o identificarse inequívocamente.

### Gate 2 · preflight de solo lectura

Ejecutar `scripts/production-backend-alignment-preflight.sql` contra Production. Debe finalizar con:

`FINANCIAL_APP_BACKEND_PREFLIGHT_OK`

Si falla cualquier aserción, detener el corte. No corregir datos automáticamente.

### Gate 3 · tenancy aditiva

Aplicar únicamente:

1. `20260909185000_pre001_workspace_tenancy.sql`

Verificar inmediatamente workspace personal, membership owner/default, backfill de `workspace_id` y triggers bancarios activos.

### Gate 4 · gateway puente

Desplegar `financial-app-db-gateway` usando todos los ficheros del gateway final validado, sustituyendo **solo durante este paso** `workspace-context.ts` por el contenido de `ops/backend-alignment/workspace-context-rollout-bridge.ts.template`.

Smoke mínimo antes de seguir: autenticación, `health`, lecturas principales y ausencia de mutación bancaria.

### Gate 5 · aislamiento y lockdown

Aplicar, en orden:

2. `20260909193000_pre001_workspace_isolation.sql`
3. `20260909194500_pre001_workspace_fk_semantics.sql`
4. `20260909200000_pre001_function_surface_lockdown.sql`

Después de la migración 2 el gateway puente debe pasar automáticamente a modo `financial_app_gateway`. Si no puede hacerlo, debe fallar cerrado.

No continuar con PRE-020 si las lecturas/escrituras normales, RLS o los gates cross-tenant no están verdes.

### Gate 6 · PRE-020 y CR-001 fail-closed

Aplicar, en orden:

5. `20260909213000_pre020_workspace_structured_export.sql`
6. `20260910050000_pre020_workspace_deletion_impact.sql`
7. `20260910060000_pre020_workspace_deletion_intent.sql`
8. `20260910070000_pre020_workspace_deletion_readiness.sql`
9. `20260910080000_pre020_storage_cleanup_validated.sql`
10. `20260910123000_cr001_workspace_deletion_local_executor.sql`

No configurar retención y no activar `execution_enabled`.

### Gate 7 · gateway final estricto

Sustituir la Edge puente por la Edge final validada de CR-001B. El `workspace-context.ts` final debe volver a exigir siempre `SET ROLE financial_app_gateway`.

No usar el bridge como código permanente.

### Gate 8 · postflight

Ejecutar `scripts/production-backend-alignment-postflight.sql`. Debe finalizar con:

`FINANCIAL_APP_BACKEND_POSTFLIGHT_OK`

Además comprobar desde la plataforma la Edge activa, SHA esperado, Data Trust `not_available`, `execution_enabled=false`, ausencia de recibos destructivos y gates funcionales principales.

## Política de fallo y rollback

- Antes de aislamiento: si tenancy o el bridge fallan, no seguir.
- Después de aislamiento: no volver a un gateway legacy. Mantener bridge en modo estricto o desplegar el gateway final; cualquier ausencia de rol/contexto debe fallar cerrado.
- No reparar migraciones parcialmente aplicadas con SQL ad hoc sin reconstruir antes el estado real.
- No reescribir timestamps remotos para que “parezcan” coincidir con el repo.
- No borrar filas de `supabase_migrations.schema_migrations` como mecanismo de reconciliación.

## Mejora obligatoria del proceso de release

Una release futura no debe poder declararse validada comprobando solo Vercel. Antes de publicar tag/release debe existir un gate que confirme paridad de migraciones por nombre, marcadores de esquema, política destructiva, Edge Function esperada y SHA frontend esperado.