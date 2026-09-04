# Financial App — Estado de validación de Fase 1

Fecha de actualización: 2026-09-04

Este documento es acumulativo y complementa `FOUNDATIONS.md`. No sustituye el historial técnico anterior; registra la evidencia de cierre más reciente de la Fase 1.

## Estado actual

- Versión base: `0.0.1`.
- Rama de trabajo: `rebuild/phase-1-foundations`.
- `main`: no modificado por este cierre.
- Producción: no modificar hasta completar el último gate de Fase 1.
- OCR: permanece fuera del camino crítico y reservado para su fase oficial.
- PR de cierre: `#286`, todavía en Draft y sin merge.
- Último commit funcional + CI reproducible validado antes de esta actualización documental: `efc7814513e3058adcf23125afe823fd25a181b7`.

## Evidencia validada

### Aplicación y dominio

- 26 comprobaciones automáticas de Fundamentos verdes.
- Formato regional: `es-ES`, `EUR`, `Europe/Madrid`.
- Importes monetarios con dos decimales y agrupación de miles explícita, incluida la regresión `1.234,56 €`.
- Fuente bancaria inmutable y de solo lectura.
- Configuración de cuentas y categorías con validaciones de dominio, API y PostgreSQL.
- Categorías protegidas frente a ciclos, fusiones imposibles y cambios de tipo incompatibles con subcategorías.

### PostgreSQL / Supabase

- Proyecto dedicado `financial-app` (`btzukbfesxdratqnxuoj`).
- Migraciones aplicadas en el esquema privado `financial_app`.
- Suites PostgreSQL ejecutadas con `BEGIN`/`ROLLBACK` y sin residuos ficticios.
- Security Advisor: 0 lints tras el endurecimiento de jerarquías.
- La regresión padre/hijo de categorías queda bloqueada tanto en dominio como en PostgreSQL.

### E2E interactivo de Configuración

Última ejecución reproducible validada:

- GitHub Actions run: `33838097241`.
- Commit: `efc7814513e3058adcf23125afe823fd25a181b7`.
- Job `browser-interaction-e2e`: **success**.
- Instalación de dependencias: `npm ci --ignore-scripts --no-audit --no-fund`.
- Node.js: 24.x.

Se ejecutaron los proyectos:

- `chromium-desktop`;
- `chromium-mobile`.

La ejecución interactiva confirma:

- carga e hidratación real de `/configuration`;
- visualización de la cuenta de prueba;
- formato monetario español `1.234,56 €`;
- rechazo de entrada monetaria anglosajona con mensaje de formato español;
- protección de jerarquías imposibles;
- protección de destinos de fusión incompatibles o descendientes;
- ausencia de scroll horizontal en escritorio y móvil.

Las respuestas de `/api/configuration` en esta suite están interceptadas con fixtures controlados para no introducir datos ficticios en PostgreSQL. La persistencia real se valida por sus health checks y pruebas PostgreSQL independientes.

### Vercel

Deployment del mismo commit reproducible validado:

- deployment: `dpl_J9geZQ8gEwSkzv6KFyePRVthKqFz`;
- commit: `efc7814513e3058adcf23125afe823fd25a181b7`;
- estado: `READY`;
- branch alias protegido mediante Vercel Authentication;
- build generada con Next.js 16.3.1 / Turbopack.

No se ha desactivado la protección del preview.

## CI reproducible

El repositorio ya contiene `package-lock.json` real y verificado.

Proceso de materialización y comprobación:

1. GitHub Actions ejecutó `npm install` con Node 24 sobre el `package.json` real de la rama y generó `package-lock.json`.
2. El workflow subió ese lockfile como artefacto `generated-package-lock` en el run `33837410909`.
3. Artefacto: ID `9923832304`.
4. Digest ZIP comunicado por GitHub: `sha256:8bcced3dd33581c246be546c77b8d65da03be20f4cd92fb6e546e072f25088be`.
5. El `package-lock.json` extraído tiene `lockfileVersion: 3`, nombre `financial-app`, versión `0.0.1` y las versiones exactas declaradas en `package.json`.
6. SHA-256 del archivo extraído: `3359035f40910b35820f2f7d9d058845d45dd11c02932b66ccae046a1b1021cd`.
7. Git blob SHA calculado para ese archivo: `904ccc06b9f0896280678037a9edb7dd645a3db0`.
8. El `package-lock.json` finalmente comiteado en GitHub tiene exactamente el mismo blob SHA `904ccc06b9f0896280678037a9edb7dd645a3db0`.
9. Commit de materialización realizado por `github-actions[bot]`: `8cf8978191a931290c5946ec5ddfde5f08972784` (`chore(ci): lock npm dependencies`).
10. El permiso temporal `contents: write` usado únicamente para materializar el lockfile fue retirado inmediatamente después.
11. El workflow definitivo vuelve a `permissions: contents: read`, activa `cache: npm` y usa `npm ci --ignore-scripts --no-audit --no-fund` tanto en el E2E local como en el futuro E2E live protegido.
12. El run `33838097241` confirmó que el CI definitivo con `npm ci` y los proyectos Chromium desktop + mobile termina correctamente.

Por tanto, las dependencias dejan de resolverse libremente en cada ejecución y el CI queda reproducible a partir del lockfile verificado.

## Único gate pendiente

Permanece pendiente exclusivamente el **Live E2E contra el preview protegido de Vercel**.

El workflow contiene el job `protected-preview-live`, pero los pasos live solo se ejecutan cuando existe `VERCEL_AUTOMATION_BYPASS_SECRET` como secreto de GitHub Actions.

La integración disponible en esta sesión permite inspeccionar deployments y generar enlaces temporales, pero no permite crear/configurar el Automation Bypass ni escribir secretos de GitHub. Los enlaces temporales tampoco conservan aquí la cookie SSO entre peticiones, por lo que una respuesta 302 a Vercel SSO no se contabiliza como validación.

No se debe resolver este gate:

- desactivando Vercel Authentication;
- escribiendo el secreto en Git;
- exponiendo el secreto al navegador;
- contando un redirect 302 como éxito;
- fusionando el PR antes de ejecutar realmente el Live E2E.

## Regla de cierre

Fase 1 solo se considera cerrada cuando:

1. todas las suites actuales permanecen verdes;
2. el Live E2E protegido se ejecuta contra el SHA exacto del preview;
3. `/api/health/foundations` responde `status: ok` en ese preview;
4. `/api/health/configuration-persistence` completa el roundtrip real y su limpieza;
5. no quedan residuos de prueba;
6. solo entonces el PR #286 puede dejar Draft, fusionarse y habilitar el inicio de Fase 2.
