# 10b · Activación y divulgación progresiva · Financial App 10.0.67

## Objetivo

Cerrar UX-001 y UX-008 como un único problema de arquitectura de información: una persona nueva debe llegar al primer beneficio sin aprender primero la arquitectura interna, mientras la trazabilidad y los diagnósticos técnicos siguen disponibles bajo demanda.

## UX-001 · onboarding orientado a resultado

La ruta `/onboarding` deja de presentar módulos como objetivo principal y deriva cinco resultados a partir del estado real de la aplicación:

1. **Tus datos disponibles** → conectar movimientos.
2. **Datos verificados** → comprobar que la actualización terminó correctamente.
3. **Cuentas preparadas** → confirmar las cuentas activas.
4. **Visión general lista** → acceder al primer resumen financiero.
5. **Todo bajo control** → entrar en la cola unificada de decisiones pendientes.

La pantalla calcula el progreso desde las fuentes existentes (`/api/source/google/status`, `/api/source/google/sync`, `/api/configuration` y `/api/financial?mode=snapshot`). No persiste casillas, pasos completados ni una segunda fuente de verdad.

### Siguiente mejor acción

La primera jerarquía visual ya no son cinco tarjetas equivalentes. Existe una tarjeta dominante que muestra una única acción siguiente basada en el estado vivo. Cuando el resumen ya está disponible, la tarjeta cambia de activación a beneficio: `Ver mi resumen` y `Ver pendientes`.

## UX-008 · divulgación progresiva

La explicación de contratos, señales internas y garantías de cálculo deja de competir con la acción principal del onboarding. Se conserva en un `<details>` accesible bajo `Qué comprueba Financial App por detrás`.

La ruta de Fuente bancaria mantiene su separación ya existente entre operación normal y diagnóstico avanzado mediante el enlace `Detalles técnicos` a `/configuration/source/diagnostics`.

No se elimina trazabilidad: se cambia su jerarquía.

## Contrato de aceptación

REL-067 no se considerará cerrada hasta demostrar conjuntamente:

- versión de aplicación `10.0.67` y lockfile sincronizado;
- un usuario sin preparación ve una única siguiente acción útil en primer nivel;
- el flujo usa lenguaje de resultado y evita `motor financiero central` / `módulos propietarios` en la primera capa del onboarding;
- la documentación técnica permanece cerrada por defecto y accesible bajo demanda;
- un estado preparado lleva directamente al resumen y a pendientes;
- el onboarding continúa derivándose de datos reales, sin estado paralelo;
- los diagnósticos de Fuente siguen alcanzables;
- TypeScript, build, E2E focalizado, continuidad UX 10.0.66 y matriz responsive pasan en el mismo candidato.

## Gates

- `npm run verify:activation`
- `npm run typecheck`
- `npm run build`
- `npm run test:activation`
- `npm run test:ux-continuity`
- `npm run test:responsive-matrix`

Workflow: `.github/workflows/release-10.0.67.yml`.

## Evidencia de cierre REL-067

- candidatura exacta previa al merge: `2367b66ee39a8f78b1c967879c24d3046674402f`;
- PR de release: `#529`;
- commit funcional estable integrado y protegido por backup: `af950ba86156d4b5f0c4dad97b76ecc4cba8c381`;
- los workflows de certificación de la candidatura terminaron en `success`, incluidos `Release 10.0.67` (run `37135392553`) y `UX 15 User Value`;
- `Production Backup v2` ejecutado sobre el commit funcional exacto, run `37135719112`: identidad, copia de PostgreSQL y Storage, cifrado, validación del artefacto y restauración aislada en PostgreSQL 17 completados con éxito;
- commit de publicación: `e4b6fe1db6de9385edd10b25c96da89b69b4035e`;
- deployment de producción: `dpl_3DWXTFRU7iX7o1RQ4c5hUCwMtHsM`;
- URL estable: `https://financialapp-home.vercel.app/`;
- `/api/build` certificó `version=10.0.67`, `targetVersion=10.0.67`, `branch=main`, el commit de publicación y el deployment exacto, con `releaseDeployable=true`;
- Git deployments se cerraron de nuevo tras verificar Producción en el commit `e073002b828758b9e16458562db006f62b610d03`;
- `Production Postflight` exacto, run `37137131491`: identidad, recorrido desktop/móvil/PWA, seguridad y lectura de datos reales con sesión forzada a solo lectura terminaron en `success`;
- los dispatchers temporales de backup y postflight fueron retirados después de su uso.

## Estado

REL-067: **CERRADA, CERTIFICADA Y PUBLICADA EN PRODUCCIÓN**.
