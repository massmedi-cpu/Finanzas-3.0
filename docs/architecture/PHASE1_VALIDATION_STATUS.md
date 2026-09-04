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

GitHub Actions run: `33836681864`.

Commit validado:

`23581a5caec33a5ffc9a946df126d19b3487eeaf`

Resultado del job `browser-interaction-e2e`: **success**.

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

Deployment del mismo commit:

- deployment: `dpl_vigMt9mDySPkWsU9ggbnhXsR41nr`;
- commit: `23581a5caec33a5ffc9a946df126d19b3487eeaf`;
- estado: `READY`;
- status de commit Vercel: `success`;
- branch alias protegido mediante Vercel Authentication.

No se ha desactivado la protección del preview.

## Único gate pendiente

Permanece pendiente exclusivamente el **Live E2E contra el preview protegido de Vercel**.

El workflow ya contiene el job `protected-preview-live`, pero los pasos live solo deben ejecutarse cuando exista `VERCEL_AUTOMATION_BYPASS_SECRET` como secreto de GitHub Actions.

La integración disponible en esta sesión permite inspeccionar deployments y generar enlaces temporales, pero no permite crear/configurar el Automation Bypass ni escribir secretos de GitHub. Los enlaces temporales tampoco conservan aquí la cookie SSO entre peticiones, por lo que una respuesta 302 a Vercel SSO no se contabiliza como validación.

No se debe resolver este gate:

- desactivando Vercel Authentication;
- escribiendo el secreto en Git;
- exponiendo el secreto al navegador;
- contando un redirect 302 como éxito;
- fusionando el PR antes de ejecutar realmente el Live E2E.

## CI reproducible

Se ha detectado que el repositorio todavía no contiene `package-lock.json`, por lo que GitHub Actions usa actualmente `npm install --ignore-scripts` y puede tardar varios minutos resolviendo dependencias.

Se intentó generar un lockfile real a partir del `package.json` actual, pero el entorno de ejecución no completó el acceso al registro npm. No se ha inventado ni copiado un lockfile no verificado. Hasta disponer de uno generado correctamente, se mantiene el comportamiento existente antes que degradar la reproducibilidad con un archivo dudoso.

Cuando exista un `package-lock.json` real y validado, el workflow deberá migrar a `npm ci --ignore-scripts`.

## Regla de cierre

Fase 1 solo se considera cerrada cuando:

1. todas las suites actuales permanecen verdes;
2. el Live E2E protegido se ejecuta contra el SHA exacto del preview;
3. `/api/health/foundations` responde `status: ok` en ese preview;
4. `/api/health/configuration-persistence` completa el roundtrip real y su limpieza;
5. no quedan residuos de prueba;
6. solo entonces el PR #286 puede dejar Draft, fusionarse y habilitar el inicio de Fase 2.
