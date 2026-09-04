# Financial App — Estado de validación de Fase 1

Fecha de actualización: 2026-09-04

Este documento es acumulativo y complementa `FOUNDATIONS.md`. Registra únicamente evidencia comprobada; un job omitido o un redirect SSO nunca se contabiliza como prueba superada.

## Progreso oficial

- Fase actual: **Fase 1 — Fundamentos**.
- Peso oficial de Fase 1 en el roadmap completo: **8%**.
- Avance interno verificado de Fase 1: **98%**.
- Avance ponderado del proyecto completo: **7,84%**.
- Fases 2–13: no iniciadas y no contabilizadas.

El 2% restante se reserva exclusivamente para ejecutar y registrar el Live E2E sobre el preview protegido real de Vercel.

## Estado protegido del proyecto

- Versión base: `0.0.1`.
- Objetivo `10.0.0`: reservado al final del roadmap completo.
- Rama: `rebuild/phase-1-foundations`.
- `main`: permanece en `17aada72aa1b1bf1802f3ae160007d707c95905f`.
- Producción: no modificar antes del cierre de Fase 1.
- OCR: aislado y reservado para Fase 11.
- PR de cierre: `#286`, Draft y sin merge.

## Arquitectura y dominio verificados

- Esquema privado `financial_app` con 17 tablas para cuentas, movimientos, categorías, comercios, presupuestos, recurrentes, previsiones, documentos, relaciones, sincronización y auditoría.
- Fuente bancaria original inmutable y estrictamente de solo lectura; correcciones manuales aisladas en overrides.
- Formato único `es-ES`, `EUR`, `Europe/Madrid`, con dos decimales y agrupación española (`1.234,56 €`).
- Configuración de cuentas y categorías implementada en dominio, API, persistencia y UI.
- Jerarquías protegidas frente a ciclos, cambios de tipo incompatibles y combinaciones de ciclo de vida inválidas.
- Reordenación de cuentas limitada al mismo grupo de ciclo de vida.
- Reordenación de categorías limitada al mismo tipo y padre.
- Fusión de categorías exige destino activo, mismo tipo, ausencia de descendencia incompatible y ausencia de colisiones de subcategorías/presupuestos.

## Motores PostgreSQL canónicos

PostgreSQL es la fuente canónica para las mutaciones globales de Configuración:

- `financial_app.reorder_accounts(uuid[])`;
- `financial_app.reorder_categories(uuid[])`;
- `financial_app.merge_categories(uuid, uuid)`.

`PostgresAccountRepository`, `PostgresCategoryRepository` y el Edge Gateway delegan en esas funciones; no mantienen algoritmos paralelos de reordenación o fusión.

La fusión canónica bloquea durante la operación todas las tablas que pueden referenciar categorías (`categories`, `merchants`, `transactions`, `transaction_overrides`, `categorization_rules`, `recurrences`, `budgets`, `forecast_items`) para impedir carreras de escritura.

## PostgreSQL / Supabase

Proyecto dedicado: `financial-app` (`btzukbfesxdratqnxuoj`).

Migraciones oficiales aplicadas:

1. `20260903200004_financial_app_foundations`
2. `20260903200023_source_snapshot_history`
3. `20260903200134_harden_function_search_paths`
4. `20260903200201_index_foreign_keys`
5. `20260904034944_enforce_category_child_kind`
6. `20260904050506_enforce_category_lifecycle_hierarchy`
7. `20260904062132_centralize_configuration_mutations`
8. `20260904072029_harden_category_merge_concurrency`

Regresiones permanentes:

- `supabase/tests/foundation_integrity.sql`;
- `supabase/tests/configuration_persistence.sql`;
- `supabase/tests/category_lifecycle_integrity.sql`;
- `supabase/tests/configuration_mutation_functions.sql`.

La regresión de mutaciones se ejecutó contra las funciones instaladas con `BEGIN`/`ROLLBACK` y verificó reordenaciones válidas, rechazo de cruces de grupo, rechazo de destino archivado y fusión válida.

Últimos residuos comprobados tras rollback:

- `accounts = 0`;
- `categories = 0`;
- `transaction_source_records = 0`;
- `transactions = 0`;
- `transaction_overrides = 0`.

Security Advisor tras el último DDL: **0 lints**.

### Edge Gateway

`financial-app-db-gateway` está desplegado como **v6 ACTIVE**. La versión viva fue releída y confirma que `account.reorder`, `category.reorder` y `category.merge` llaman a los tres motores PostgreSQL canónicos.

`verify_jwt=false` se mantiene deliberadamente porque el gateway realiza validación OIDC personalizada de Vercel en el propio código; no significa ausencia de autenticación.

## GitHub Actions / Playwright

Última ejecución funcional validada antes de esta actualización documental:

- commit: `0134d63db983f1a88c9924159f83dcedca6042da`;
- run: `33852713990`;
- `browser-interaction-e2e`: **success**;
- Node 24;
- `npm ci --ignore-scripts --no-audit --no-fund`;
- Chromium desktop + mobile;
- `protected-preview-access`: **success** como sonda de disponibilidad;
- `protected-preview-live`: **skipped**, correctamente, porque todavía no existe un método de acceso autorizado.

El E2E interactivo valida `/configuration`, hidratación real, formato monetario español, rechazo de entrada anglosajona, restricciones de jerarquía/fusión/ciclo de vida y ausencia de scroll horizontal.

La suite live exige actualmente al menos **36 controles de Fundamentos** y exactamente **10 controles de persistencia**.

## CI de acceso al preview protegido

El workflow ya soporta automáticamente los dos mecanismos oficiales previstos:

1. `VERCEL_AUTOMATION_BYPASS_SECRET` mediante `x-vercel-protection-bypass`.
2. GitHub Actions OIDC mediante `x-vercel-trusted-oidc-idp-token` cuando GitHub esté autorizado como Trusted Source en Vercel.

La sonda `protected-preview-access` genera un token OIDC efímero, no lo imprime y no lo guarda. Si ninguno de los dos mecanismos está autorizado, `protected-preview-live` aparece como **skipped**, no como success.

En cuanto uno de los métodos sea válido, el workflow continúa automáticamente sin cambios de código: checkout del SHA, Node, dependencias, Chromium, espera del SHA exacto y Playwright live.

## Vercel

Deployment validado para `0134d63db983f1a88c9924159f83dcedca6042da`:

- deployment: `dpl_G1JKjw6xuKBEoqH4D7MtkunfjgEX`;
- estado: **READY**;
- branch alias correcto;
- Next.js 16.3.1;
- compilación: correcta;
- TypeScript: correcto;
- generación estática: **4/4**;
- deployment completado sin error.

No se ha desactivado Vercel Authentication.

## Diagnóstico del único gate pendiente

- `VERCEL_AUTOMATION_BYPASS_SECRET`: no configurado en GitHub Actions.
- GitHub genera correctamente un token OIDC efímero.
- Vercel todavía no acepta ese OIDC para atravesar Deployment Protection porque GitHub Actions no está autorizado como Trusted Source en el proyecto.
- El conector de Vercel disponible permite consultar proyecto, deployments, logs y enlaces temporales, pero no expone una acción de escritura para crear el bypass ni configurar Trusted Sources.
- Los enlaces temporales de Vercel no sirven para este E2E automatizado desde el conector actual porque el flujo SSO requiere conservar una cookie de sesión entre redirects.

## Único gate pendiente

Para cerrar Fase 1 falta ejecutar realmente `protected-preview-live` y confirmar:

1. SHA exacto del preview protegido;
2. `/api/health/foundations` con todos sus controles verdes;
3. `/api/health/configuration-persistence` con sus 10 controles verdes;
4. Playwright desktop + mobile sobre ese preview;
5. limpieza final sin residuos.

Vías válidas:

- configurar de forma segura `VERCEL_AUTOMATION_BYPASS_SECRET`; o
- autorizar GitHub Actions como Trusted Source en Vercel.

No son válidos: desactivar SSO, publicar secretos, aceptar un 302 como éxito, marcar el Live E2E como verde cuando está omitido ni fusionar el PR antes del gate.

## Continuidad

Siguiente acción exacta: habilitar uno de los dos mecanismos oficiales de acceso automatizado al preview protegido. El CI ya está preparado para detectarlo y ejecutar automáticamente el Live E2E. Solo si ese job queda realmente verde y no hay residuos se marcará Fase 1 al 100%, el total al 8,00%, se sacará el PR #286 de Draft y se habilitará Fase 2.
