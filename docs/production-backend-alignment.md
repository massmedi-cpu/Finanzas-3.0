# Financial App · alineación segura del backend de Production

Estado de diseño: **preparado, no ejecutado**.

Este runbook existe porque la release web 10.0.2 quedó por delante del backend real de Supabase. No autoriza cambios de Production por sí mismo y no modifica la política comercial de borrado.

## Invariantes

- `main`/Vercel Production permanece en 10.0.2 hasta superar todos los gates.
- La fuente bancaria oficial sigue siendo de solo lectura para runtime.
- Los ficheros externos de Google Drive nunca se borran como parte de workspace deletion.
- `workspace-deletion` permanece `not_available` en Data Trust/UI.
- No existe endpoint público/self-service que ejecute el borrado.
- `workspace_deletion_runtime_policy.execution_enabled` debe quedar `false` después de la alineación.
- No se define ni se inventa una política de retención durante este corte.
- No se usa `supabase db push` para reconciliar Production: el historial remoto contiene migraciones equivalentes con timestamps distintos.
- Las migraciones pendientes se aplican explícitamente por **nombre + SQL exacto**, en orden.
- Ningún commit operativo desacoplado se considera validado para Production por existir: debe superar la batería completa antes del corte.

## Frontera verificada antes del corte

- Supabase Production tiene 47 migraciones registradas hasta `pre007_forecast_write_integrity`.
- 30 coinciden también por timestamp con el repositorio.
- 17 coinciden por nombre pero no por timestamp; su SQL remoto queda además congelado por huella MD5 en `production-backend-alignment-history-fingerprint.sql`.
- PRE-001, PRE-020 y CR-001 no están aplicadas todavía en la base real.
- La Edge Function activa `financial-app-db-gateway` es anterior a PRE-001/PRE-020.
- Las precondiciones de tenancy, integridad bancaria y unicidad se comprobaron en modo de solo lectura y no presentan conflictos conocidos.
- La reconciliación inicial enumeraba 10 migraciones pendientes. Después de revisar el estado post-CR-001 se detectó una incoherencia sólo de diagnóstico: PRE-020G seguía diciendo que el executor no existía. Se conserva la reconciliación original como evidencia y se añade `ops/backend-alignment/cr001c-readiness-addendum.json` con una migración acumulativa número 11.
- La frontera final esperada pasa a ser 58 migraciones: 47 actuales + 11 pendientes.

## Estado de validación del código

- `4030e7fd...` sigue siendo el último SHA con los gates completos verdes de CR-001B.
- Las mejoras operativas y CR-001C posteriores están en commits desacoplados, sin rama y sin Vercel.
- Esas mejoras **no están autorizadas para Production** hasta repetir y superar los gates completos sobre el candidato que finalmente las agrupe.

## Por qué hace falta un gateway puente

La migración `pre001_workspace_tenancy` crea `workspaces`, `workspace_memberships` y el ownership inicial, pero todavía no crea el rol `financial_app_gateway`.

El gateway final estricto exige `SET ROLE financial_app_gateway`; por tanto no puede instalarse inmediatamente después de tenancy. A su vez, activar RLS antes de sustituir el gateway antiguo dejaría al runtime sin contexto de workspace.

El artefacto `ops/backend-alignment/workspace-context-rollout-bridge.ts.template` resuelve esa transición. Se carga como `workspace-context.ts` únicamente durante el despliegue temporal:

1. Después de tenancy, resuelve membership y fija GUCs, pero conserva temporalmente el principal legacy mientras **no existan ni el rol nuevo ni el marcador de aislamiento**.
2. Cuando existen conjuntamente `financial_app.require_current_workspace_id()` y `financial_app_gateway`, cambia a `SET ROLE financial_app_gateway`.
3. Cualquier estado parcial —rol sin marcador o marcador sin rol— falla cerrado con `workspace_isolation_state_inconsistent`.
4. Si el rol existe pero no tiene permisos suficientes, la petición falla cerrada; nunca se inventa un fallback posterior al aislamiento.
5. Tras completar las migraciones se sustituye el puente por el gateway final estricto del candidato que haya superado todos los gates.

El puente es un artefacto operativo temporal; no debe convertirse en el `workspace-context.ts` permanente.

## Secuencia de corte propuesta

### Gate 0 · congelación

- No desplegar otros cambios de backend durante el corte.
- Registrar SHA web, versión Edge y frontera de migraciones antes de empezar.
- Confirmar que la UI de borrado sigue no disponible y que no existe endpoint público de ejecución.
- Confirmar que el candidato exacto que se usará en Edge ha superado previamente los gates completos.

### Gate 1 · backup recuperable

- Ejecutar el workflow de backup de Production ya existente.
- Exigir `pg_dump` correcto, validación del archivo y SHA-256 del artefacto.
- No continuar si el backup no puede recuperarse o identificarse inequívocamente.

### Gate 2 · comprobaciones de solo lectura

Primero ejecutar `scripts/production-backend-alignment-history-fingerprint.sql`. Debe finalizar con:

`FINANCIAL_APP_BACKEND_HISTORY_FINGERPRINT_OK`

Después ejecutar `scripts/production-backend-alignment-preflight.sql`. Debe finalizar con:

`FINANCIAL_APP_BACKEND_PREFLIGHT_OK`

Ambas son de solo lectura. Si falla cualquiera, detener el corte. No corregir datos automáticamente.

### Gate 3 · tenancy aditiva

Aplicar únicamente:

1. `20260909185000_pre001_workspace_tenancy.sql`

Verificar inmediatamente workspace personal, membership owner/default, backfill de `workspace_id` y triggers bancarios activos.

### Gate 4 · gateway puente

Desplegar `financial-app-db-gateway` usando todos los ficheros del candidato final que haya superado los gates, sustituyendo **solo durante este paso** `workspace-context.ts` por el contenido de `ops/backend-alignment/workspace-context-rollout-bridge.ts.template`.

Smoke mínimo antes de seguir: autenticación, `health`, lecturas principales y ausencia de mutación bancaria.

### Gate 5 · aislamiento y lockdown

Aplicar, en orden:

2. `20260909193000_pre001_workspace_isolation.sql`
3. `20260909194500_pre001_workspace_fk_semantics.sql`
4. `20260909200000_pre001_function_surface_lockdown.sql`

Después de la migración 2 el gateway puente debe pasar automáticamente a modo `financial_app_gateway`. Si detecta cualquier estado parcial, debe fallar cerrado.

No continuar con PRE-020 si las lecturas/escrituras normales, RLS o los gates cross-tenant no están verdes.

### Gate 6 · PRE-020 y CR-001 fail-closed

Aplicar, en orden:

5. `20260909213000_pre020_workspace_structured_export.sql`
6. `20260910050000_pre020_workspace_deletion_impact.sql`
7. `20260910060000_pre020_workspace_deletion_intent.sql`
8. `20260910070000_pre020_workspace_deletion_readiness.sql`
9. `20260910080000_pre020_storage_cleanup_validated.sql`
10. `20260910123000_cr001_workspace_deletion_local_executor.sql`
11. `20260910173000_cr001_workspace_deletion_readiness_alignment.sql`

La migración 11 no habilita borrado: elimina del diagnóstico actual el blocker histórico `destructive_executor_not_implemented`, declara el executor local como implementado y mantiene `canExecute=false` con `self_service_execution_endpoint_not_exposed` como bloqueo explícito.

No configurar retención y no activar `execution_enabled`.

### Gate 7 · gateway final estricto

Sustituir la Edge puente por la Edge final **del mismo candidato previamente validado**. El `workspace-context.ts` final debe volver a exigir siempre `SET ROLE financial_app_gateway`.

El handler de readiness puede afirmar `runtimeOrchestratorImplemented=true` porque esa respuesta sólo puede proceder del bundle que contiene y enruta el orquestador; eso no equivale a activación comercial. Debe seguir indicando `selfServiceExecutionEndpointExposed=false`.

No usar el bridge como código permanente.

### Gate 8 · postflight

Volver a ejecutar `scripts/production-backend-alignment-history-fingerprint.sql` para comprobar que las 17 migraciones históricas siguen intactas.

Después ejecutar `scripts/production-backend-alignment-postflight.sql`. Debe finalizar con:

`FINANCIAL_APP_BACKEND_POSTFLIGHT_OK`

El postflight exige exactamente 58 migraciones/58 nombres, la superficie real de funciones —incluida `export_current_workspace_data()`—, RLS forzado, la fuente bancaria protegida, política de borrado apagada, cero recibos destructivos y el readiness CR-001C sin el blocker histórico del executor.

Además comprobar desde la plataforma la Edge activa, SHA esperado, Data Trust `not_available`, ausencia de endpoint público de ejecución, `execution_enabled=false`, ausencia de recibos destructivos y gates funcionales principales.

## Política de fallo y rollback

- Antes de aislamiento: si tenancy o el bridge fallan, no seguir.
- Después de aislamiento: no volver a un gateway legacy. Mantener bridge en modo estricto o desplegar el gateway final; cualquier ausencia de rol/contexto debe fallar cerrado.
- No reparar migraciones parcialmente aplicadas con SQL ad hoc sin reconstruir antes el estado real.
- No reescribir timestamps remotos para que “parezcan” coincidir con el repo.
- No borrar filas de `supabase_migrations.schema_migrations` como mecanismo de reconciliación.
- No activar la política de borrado como forma de comprobar el executor en Production.

## Mejora obligatoria del proceso de release

Una release futura no debe poder declararse validada comprobando solo Vercel. Antes de publicar tag/release debe existir un gate que confirme paridad de migraciones por nombre, marcadores de esquema, política destructiva, Edge Function esperada y SHA frontend esperado.
