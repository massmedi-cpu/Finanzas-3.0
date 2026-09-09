# PRE-007 — Integridad de escrituras de Previsión

## Alcance

PRE-007 protege las escrituras manuales de Previsión frente a dos riesgos concretos:

1. Repetir el mismo alta por reintento no puede crear duplicados.
2. Una mutación basada en una versión obsoleta no puede sobrescribir un estado más reciente y debe responder como conflicto.

La fuente bancaria oficial permanece estrictamente en solo lectura y esta iniciativa no modifica movimientos bancarios ni motores financieros centrales.

## Evidencia test-first

- Commit rojo: `0338c64fc35f549bb6439f866c543d48d11175ae`.
- Run: `34309961442`.
- Antes de implementar, las pruebas demostraron que el mismo alta manual generaba IDs distintos y que `expectedUpdatedAt` no alcanzaba la capa SQL.

## Implementación validada

- Checkpoint de código: `1ea1a01f9daef6e782792c65c54b7636b9763870`.
- Run local completo: `34311911199` — SUCCESS.
- Build Next.js 16.3.1 y TypeScript: verde.
- Playwright desktop + móvil: `368 passed`, `77 skipped`, `0 final failures`.
- Un único flaky legacy de Movimientos pasó en retry y el mismo caso pasó en móvil a la primera; no se atribuye a PRE-007.
- Los criterios PRE-007 pasan en desktop y móvil: idempotencia, conflicto 409 por escritura obsoleta, validación de boundary/API/gateway y propagación de tokens desde UI.

## Persistencia y compatibilidad

La migración `pre007_forecast_write_integrity` quedó aplicada en Supabase Production y registrada como `20260909044954`.

Cambios aditivos:

- `financial_app.forecast_items.idempotency_key uuid` nullable.
- Índice único parcial `forecast_items_idempotency_key_unique` para claves no nulas.
- Sobrecarga idempotente de `save_manual_forecast_item(..., p_idempotency_key uuid)`.
- Sobrecargas con concurrencia optimista de `set_forecast_item_excluded(..., p_expected_updated_at timestamptz)` y `reconcile_forecast_item(..., p_expected_updated_at timestamptz)`.
- `forecast_snapshot` expone `updatedAt` por elemento.
- Las firmas anteriores permanecen disponibles para un rollout compatible con el cliente de Production existente.
- Las firmas nuevas y antiguas son ejecutables por `service_role`; `anon` y `authenticated` continúan sin permiso de ejecución.

## Verificación real sin residuo

Tras aplicar la migración se ejecutó una comprobación contra PostgreSQL real dentro de una transacción deliberadamente revertida:

- Dos llamadas con la misma idempotency key devolvieron el mismo ID.
- Sólo existió una fila para esa key.
- Un `expectedUpdatedAt` obsoleto provocó `forecast_write_conflict`.
- El `expectedUpdatedAt` actual permitió la mutación.
- La auditoría temporal contenía exactamente creación + exclusión.
- Tras `ROLLBACK`: `forecast_residue=0` y `audit_residue=0`.

Los Advisors posteriores a DDL no añadieron hallazgos atribuibles a PRE-007. Los avisos previos de seguridad y rendimiento quedan reservados a sus bloques específicos.

## Gate final

Este commit sólo sella evidencia y activa el gate `[vercel-preview]`. PRE-007 no se considerará cerrado hasta verificar sobre este SHA exacto:

- Edge `financial-app-db-gateway` apuntando al mismo SHA y ACTIVE.
- Preview Vercel exacto READY.
- `browser-interaction-e2e` SUCCESS.
- `protected-preview-live` SUCCESS.
- `/api/build` coincidente con el SHA del commit.
