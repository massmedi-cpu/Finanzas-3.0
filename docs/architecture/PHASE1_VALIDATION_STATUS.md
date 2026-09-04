# Financial App — Estado de validación de Fase 1

Fecha de actualización: 2026-09-04

Este documento es acumulativo y complementa `FOUNDATIONS.md`. Registra la evidencia verificada de Fase 1 y no declara como ejecutadas comprobaciones que siguen bloqueadas por configuración externa.

## Progreso oficial

- Fase actual: **Fase 1 — Fundamentos**.
- Peso oficial de Fase 1 en el roadmap completo: **8%**.
- Avance interno verificado de Fase 1: **98%**.
- Avance ponderado del proyecto completo: **7,84%**.
- Fases 2–13: no iniciadas; no se contabiliza progreso adelantado.

El 2% restante de Fase 1 se reserva exclusivamente para ejecutar y registrar el Live E2E contra el preview protegido de Vercel. No se redondea artificialmente a 100%.

## Estado actual

- Versión base: `0.0.1`.
- Objetivo reservado: `10.0.0` únicamente al finalizar todo el roadmap.
- Rama de trabajo: `rebuild/phase-1-foundations`.
- `main`: permanece sin modificar en `17aada72aa1b1bf1802f3ae160007d707c95905f`.
- Producción: no modificar antes del cierre de Fase 1.
- OCR: permanece aislado y reservado para la Fase 11.
- PR de cierre: `#286`, todavía Draft y sin merge.
- Último árbol funcional validado: `d3555f2394b7bdd5ac5558500ce3243e90363a5c`.
- Commit de estabilización posterior al experimento OIDC: `d0a76d46bb2b26c479e2ea445adc3c07a292ef22`; restaura exactamente el mismo árbol funcional de `d3555f...`.

## Arquitectura y dominio verificados

- Modelo privado `financial_app` con 17 tablas para cuentas, movimientos, categorías, comercios, presupuestos, recurrentes, previsiones, documentos, asociaciones, sincronización y auditoría.
- Fuente bancaria original inmutable y estrictamente de solo lectura; correcciones manuales aisladas en overrides.
- Formato regional único: `es-ES`, `EUR`, `Europe/Madrid`.
- Importes monetarios con dos decimales y formato español, incluida regresión `1.234,56 €`.
- Configuración de cuentas y categorías implementada con dominio, API, persistencia y UI.
- Jerarquías protegidas frente a ciclos, cambios de tipo incompatibles y ciclos de vida imposibles.
- Reordenación de cuentas limitada a su mismo grupo de ciclo de vida.
- Reordenación de categorías limitada al mismo tipo y padre.
- Fusión de categorías exige destino activo, mismo tipo, ausencia de descendencia incompatible y ausencia de colisiones de subcategorías/presupuestos.

## Motores PostgreSQL canónicos

Las mutaciones globales de Configuración ya no se implementan por separado en cada adaptador. PostgreSQL es la fuente canónica para:

- `financial_app.reorder_accounts(uuid[])`;
- `financial_app.reorder_categories(uuid[])`;
- `financial_app.merge_categories(uuid, uuid)`.

Tanto `PostgresAccountRepository` / `PostgresCategoryRepository` como el Edge Gateway delegan en esas funciones.

La fusión canónica bloquea durante la operación las tablas que pueden referenciar categorías (`categories`, `merchants`, `transactions`, `transaction_overrides`, `categorization_rules`, `recurrences`, `budgets`, `forecast_items`) para impedir carreras de escritura durante una fusión.

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

Regresión permanente añadida: `supabase/tests/configuration_mutation_functions.sql`.

La regresión se ejecutó contra las funciones instaladas con `BEGIN`/`ROLLBACK` y confirmó:

- reordenaciones válidas;
- rechazo de cruce activo/archivado en cuentas;
- rechazo de cruce de grupos en categorías;
- rechazo de fusión hacia destino archivado;
- fusión válida y archivado del origen;
- disponibilidad de los tres motores canónicos tras rollback.

Última comprobación de residuos:

- `accounts = 0`;
- `categories = 0`;
- `transaction_source_records = 0`;
- `transactions = 0`;
- `transaction_overrides = 0`.

Security Advisor tras el último DDL: **0 lints**.

### Edge Gateway

`financial-app-db-gateway` desplegado en Supabase como **versión 6 ACTIVE**. La versión viva fue releída y coincide con la centralización: `account.reorder`, `category.reorder` y `category.merge` llaman exclusivamente a las funciones PostgreSQL canónicas.

La función mantiene `verify_jwt=false` porque realiza validación OIDC personalizada de Vercel dentro del propio gateway; no se ha eliminado la autenticación.

## GitHub Actions / Playwright

Ejecución del árbol funcional `d3555f...`:

- run `33848585479`;
- `browser-interaction-e2e`: **success**;
- escritorio y móvil con Chromium;
- instalación reproducible mediante `npm ci` y Node 24.

El E2E local/interceptado valida carga e hidratación de `/configuration`, formato español, rechazo de entrada monetaria anglosajona, restricciones de jerarquía/fusión/ciclo de vida y ausencia de scroll horizontal.

## Vercel

Deployment funcional verificado para `d3555f...`:

- `dpl_FzSk29oxGeKoWnJ8AENFQFRutpnQ`;
- estado: **READY**;
- compilación Next.js: correcta;
- TypeScript: correcto;
- generación estática: 4/4;
- `/api/build` confirmó el SHA exacto, rama y entorno `preview`.

Posteriormente el experimento OIDC produjo el commit `ccc59f709324487c74033e709af9d0eb500128b6`, también desplegado correctamente por Vercel. Su alias devolvió el SHA exacto esperado.

## Diagnóstico del Live E2E protegido

Se probaron dos mecanismos oficiales sin desactivar Vercel Authentication:

1. **Protection Bypass for Automation**: el workflow está preparado, pero `VERCEL_AUTOMATION_BYPASS_SECRET` no está configurado.
2. **Trusted Sources con GitHub Actions OIDC**: run `33849255574`.
   - GitHub generó correctamente el token OIDC efímero.
   - checkout, Node, dependencias y Chromium se completaron.
   - el paso de acceso al preview protegido no pudo atravesar Vercel Authentication y terminó en failure tras comprobar 36 veces.
   - el alias ya estaba desplegado en el SHA correcto, por lo que el fallo no era un retraso de deployment.
   - Vercel requiere configurar la fuente/regla correspondiente en Deployment Protection > Trusted Sources para aceptar ese emisor.

El experimento OIDC fue retirado y el workflow estable se restauró en `d0a76d46...`; no se deja CI rojo permanente ni se rebaja la protección.

## Único gate pendiente

Para cerrar Fase 1 falta ejecutar realmente el Live E2E sobre el preview protegido y confirmar:

1. SHA exacto del preview;
2. `/api/health/foundations` con todos sus controles verdes;
3. `/api/health/configuration-persistence` con sus 10 controles verdes;
4. Playwright desktop + mobile sobre ese preview;
5. limpieza final sin residuos.

Vías válidas para habilitarlo:

- configurar `VERCEL_AUTOMATION_BYPASS_SECRET` de forma segura; o
- autorizar GitHub Actions como Trusted Source en Vercel con la regla apropiada.

No son vías válidas desactivar SSO, publicar secretos, aceptar un redirect 302 como éxito ni fusionar el PR antes de ejecutar el gate.

## Continuidad

Siguiente acción exacta: habilitar uno de los dos mecanismos oficiales de acceso automatizado al preview protegido, relanzar `protected-preview-live` y, solo si sus pasos sustantivos quedan verdes y no hay residuos, marcar Fase 1 al 100%, actualizar el avance total a 8,00% y habilitar el comienzo de Fase 2.
