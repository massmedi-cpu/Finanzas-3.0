# Financial App — Estado de validación de Fase 1

Fecha de actualización: 2026-09-04

Este documento es acumulativo y complementa `FOUNDATIONS.md`. No sustituye el historial técnico anterior; registra la evidencia de cierre más reciente de la Fase 1.

## Estado actual

- Versión base: `0.0.1`.
- Rama de trabajo: `rebuild/phase-1-foundations`.
- `main`: permanece sin modificar en `17aada72aa1b1bf1802f3ae160007d707c95905f`.
- Producción: no modificar hasta completar el último gate de Fase 1.
- OCR: permanece fuera del camino crítico y reservado para su fase oficial.
- PR de cierre: `#286`, todavía en Draft y sin merge.
- Último commit funcional validado antes de esta actualización documental: `08d85f2786f78e8c2ebceaf3c3f40f0aaeb0e1ec`.

## Evidencia validada

### Aplicación y dominio

- **34 comprobaciones automáticas de Fundamentos verdes**.
- Formato regional único: `es-ES`, `EUR`, `Europe/Madrid`.
- Importes monetarios con dos decimales y agrupación de miles explícita, incluida la regresión `1.234,56 €`.
- Fuente bancaria inmutable y de solo lectura.
- Configuración de cuentas y categorías con validaciones de dominio, API y PostgreSQL.
- Categorías protegidas frente a ciclos, fusiones imposibles y cambios de tipo incompatibles con subcategorías.
- Reordenación de cuentas limitada de extremo a extremo al mismo ciclo de vida: una cuenta activa no puede intercambiar posición con una archivada mediante UI, dominio ni repositorio.
- Reordenación de categorías limitada de extremo a extremo a categorías hermanas del mismo tipo y padre.
- El repositorio PostgreSQL vuelve a validar las fronteras de reordenación después de bloquear las filas con `FOR UPDATE`, evitando bypass internos y carreras entre lectura y escritura.
- Una categoría activa no puede depender de un padre archivado.
- Una categoría con subcategorías activas no puede archivarse hasta que esas subcategorías se archiven o se muevan.
- La UI no ofrece el archivado/reactivación cuando el cambio produciría una jerarquía de ciclo de vida inválida.

### PostgreSQL / Supabase

Proyecto dedicado `financial-app` (`btzukbfesxdratqnxuoj`), esquema privado `financial_app`.

Migraciones oficiales aplicadas:

1. `20260903200004_financial_app_foundations`
2. `20260903200023_source_snapshot_history`
3. `20260903200134_harden_function_search_paths`
4. `20260903200201_index_foreign_keys`
5. `20260904034944_enforce_category_child_kind`
6. `20260904050506_enforce_category_lifecycle_hierarchy`

La sexta migración amplía `financial_app.validate_category_parent()` y el trigger `categories_validate_parent` para vigilar también `lifecycle`.

Regresiones PostgreSQL permanentes:

- `supabase/tests/foundation_integrity.sql`;
- `supabase/tests/configuration_persistence.sql`;
- `supabase/tests/category_lifecycle_integrity.sql`.

La nueva regresión de ciclo de vida verifica con `BEGIN`/`ROLLBACK` que:

- archivar un padre con hijo activo se rechaza;
- crear/reactivar un hijo activo bajo un padre archivado se rechaza;
- un hijo archivado bajo un padre activo sigue siendo válido;
- no quedan residuos al finalizar.

La reproducción previa a la migración demostró que PostgreSQL permitía `padre=archived` + `hijo=active` todavía enlazado. Tras `20260904050506_enforce_category_lifecycle_hierarchy`, ese estado queda bloqueado.

Última comprobación de residuos tras las pruebas temporales:

- `accounts = 0`;
- `categories = 0`;
- `transaction_source_records = 0`;
- `transactions = 0`;
- `transaction_overrides = 0`.

Security Advisor tras el último DDL: **0 lints**.

### E2E interactivo de Configuración

Última ejecución completa validada:

- GitHub Actions run: `33839646808` (#28).
- Commit: `08d85f2786f78e8c2ebceaf3c3f40f0aaeb0e1ec`.
- Job `browser-interaction-e2e`: **success**.
- Node.js: 24.x.
- Instalación: `npm ci --ignore-scripts --no-audit --no-fund` con caché npm.
- Proyectos: `chromium-desktop` y `chromium-mobile`.

La ejecución interactiva confirma:

- carga e hidratación real de `/configuration`;
- formato monetario español `1.234,56 €`;
- rechazo de entrada monetaria anglosajona;
- protección de jerarquías y fusiones imposibles;
- el botón de archivar un padre con subcategorías activas aparece deshabilitado;
- ausencia de scroll horizontal en escritorio y móvil.

Las respuestas de `/api/configuration` de esta suite se interceptan con fixtures controlados para no introducir datos ficticios en PostgreSQL. La persistencia real se comprueba por los health checks y las suites PostgreSQL independientes.

### Vercel

Deployment del mismo commit funcional validado:

- deployment: `dpl_9oXzCFxkHaNKbgeHkrWAHJpXjsx5`;
- commit: `08d85f2786f78e8c2ebceaf3c3f40f0aaeb0e1ec`;
- estado: **READY**;
- alias: sin error;
- branch alias protegido mediante Vercel Authentication.

No se ha desactivado la protección del preview.

## CI reproducible

El repositorio contiene `package-lock.json` real y verificado, `lockfileVersion: 3`, generado por GitHub Actions con Node 24 y materializado en el commit `8cf8978191a931290c5946ec5ddfde5f08972784`.

Git blob SHA del lockfile verificado: `904ccc06b9f0896280678037a9edb7dd645a3db0`.

El workflow definitivo usa:

- `permissions: contents: read`;
- `cache: npm`;
- `npm ci --ignore-scripts --no-audit --no-fund`.

Los permisos temporales de escritura utilizados exclusivamente para materializar el lockfile y, posteriormente, el parche controlado de UX de ciclo de vida fueron retirados inmediatamente después de cada operación. El workflow actual vuelve a ser de solo lectura.

## Credenciales de Vercel comprobadas sin exposición

Se ejecutó una sonda temporal no destructiva en GitHub Actions para comprobar únicamente la existencia, no el valor, de credenciales reutilizables.

Resultado:

- `VERCEL_AUTOMATION_BYPASS_SECRET`: **no configurado**;
- `VERCEL_TOKEN`: **no configurado**.

La sonda fue retirada del workflow después de obtener el resultado. No se imprimió, almacenó ni inventó ningún secreto.

## Único gate pendiente

Permanece pendiente exclusivamente el **Live E2E contra el preview protegido de Vercel**.

El workflow contiene `protected-preview-live`, pero los pasos live solo se ejecutan cuando existe `VERCEL_AUTOMATION_BYPASS_SECRET` como secreto de GitHub Actions. Cuando exista, el job debe:

1. atravesar Vercel Authentication mediante el bypass oficial;
2. esperar a que `/api/build` devuelva exactamente el SHA del commit probado;
3. comprobar `/api/health/foundations`, ahora con al menos 34 controles;
4. ejecutar `/api/health/configuration-persistence` y verificar su roundtrip y limpieza;
5. ejecutar Playwright contra el preview protegido.

No se debe resolver este gate desactivando Vercel Authentication, exponiendo secretos, contando un redirect SSO 302 como éxito ni fusionando el PR antes de ejecutar realmente el Live E2E.

## Regla de cierre

Fase 1 solo se considera cerrada cuando:

1. todas las suites actuales permanecen verdes;
2. el Live E2E protegido se ejecuta contra el SHA exacto del preview;
3. `/api/health/foundations` responde `status: ok` en ese preview;
4. `/api/health/configuration-persistence` completa el roundtrip real y su limpieza;
5. no quedan residuos de prueba;
6. solo entonces el PR #286 puede dejar Draft, fusionarse y habilitar el inicio de Fase 2.
