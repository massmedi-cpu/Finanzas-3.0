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

## Estado

REL-067: **EN CERTIFICACIÓN**.
