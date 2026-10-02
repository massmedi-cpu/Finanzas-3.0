# 07b · Sistema visual premium — REL-054

Fecha: 2026-10-02  
Base estable al iniciar: Financial App 10.0.53 en producción  
Rama de trabajo: `release/10.0.54-premium-design-system`

## Objetivo

Continuar el cierre de la auditoría de dirección de arte sin reabrir funcionalidad ya certificada en REL-053. Este bloque se centra en reglas transversales que elevan calidad percibida y reducen drift visual, con prioridad en legibilidad, consistencia y navegación.

## Cambios del bloque

### Navegación y Patrimonio

- `Patrimonio` permanece en la navegación principal.
- `/net-worth` se incorpora a `HIGH_VALUE_PREFETCH_ROUTES` para que el nuevo módulo de REL-053 reciba el mismo tratamiento de precarga que las superficies financieras principales.
- La navegación principal queda protegida por el contrato global `.premium-primary-nav [data-nav-href]` para impedir reducciones tipográficas por debajo de `--font-helper`.
- El kicker de Patrimonio pasa de un literal inferior al mínimo a `var(--font-helper)`.
- No se modifica la semántica financiera ni el cálculo de patrimonio.

### ART-002 · mínimo tipográfico compartido

Se consolida `--font-helper: 0.8125rem` como mínimo operativo compartido y se eliminan tamaños literales inferiores en las superficies prioritarias del bloque:

- `app/globals.css`;
- `app/app-shell.module.css`;
- `app/net-worth/net-worth.module.css`;
- `app/configuration/source/source-overview.module.css`;
- `app/configuration/source/source.module.css`.

Dentro de Configuración se han elevado, entre otros, contador de tabs, `panel-kicker`, chips de estado, ayudas de campo, etiquetas del resumen de Fuente, métricas técnicas, cursores y datos de prevalidación.

El objetivo es que información necesaria para comprender estado, contexto, navegación o acción no caiga por debajo de 13 px en estas superficies prioritarias.

**Estado REL-054:** CERRADO para las cinco superficies prioritarias protegidas por guard automático. La migración del resto de CSS Modules históricos continúa como frente posterior y no se declara cerrada para todo el repositorio.

### ART-007 · familia tipográfica explícita

La hoja global deja de prometer `Inter` sin cargarla. Se introduce `--font-family-ui` con una pila explícita de sistema y `body` consume ese token.

**Estado REL-054:** CERRADO a nivel de contrato global. Cualquier futura tipografía de marca deberá cargarse de forma explícita y certificada antes de sustituir este contrato.

### Fuente simple vs diagnóstico

Los gates transversales heredados todavía esperaban el diseño anterior a REL-053. Se actualiza `tests/e2e/source-incident-trace.spec.ts` para certificar la arquitectura vigente:

- `/configuration/source` mantiene el resumen operativo simple y el feedback breve de actualización;
- `/configuration/source/diagnostics` conserva la trazabilidad persistida y el detalle técnico de incidencias;
- ambos contratos mantienen explícitamente la garantía de solo lectura del archivo bancario original.

No se relaja ninguna comprobación de integridad: se cambia la ruta y el texto esperado para que la prueba valide el comportamiento canónico actual en vez de una UI retirada.

### Guard automático

`scripts/verify-premium-design-system.mjs` falla si:

1. `--font-helper` baja de `0.8125rem`;
2. cualquiera de las cinco superficies prioritarias introduce un `font-size` literal inferior al mínimo compartido;
3. `body` deja de consumir `--font-family-ui`;
4. se vuelve a declarar `Inter` sin carga explícita en el token global;
5. la navegación principal pierde la protección de mínimo tipográfico;
6. el kicker de Patrimonio deja de usar `--font-helper`;
7. `Patrimonio` desaparece de navegación o de la precarga principal.

El comando canónico es `npm run verify:premium-design`.

## Certificación REL-054

El workflow `Release 10.0.54` ejecuta sobre el SHA exacto del PR:

- guard de sistema visual premium;
- TypeScript;
- build de producción;
- matriz responsive existente en Chromium;
- regresión de Fuente simple + Diagnóstico en escritorio y móvil.

El candidato funcional `6644ea9fcb20eeaafadd972232885357cbcda051` quedó completamente verde en ese workflow, incluida la regresión de Fuente ya adaptada a la arquitectura canónica REL-053.

## Materialización de versión

Después de certificar el candidato funcional, la identidad se materializó de forma conjunta con `npm version 10.0.54 --no-git-tag-version`, modificando únicamente `package.json` y `package-lock.json`.

Comprobaciones explícitas de identidad:

- `package.json.version = 10.0.54`;
- `package-lock.json.version = 10.0.54`;
- `package-lock.json.packages[""].version = 10.0.54`.

El lanzador efímero usado para realizar ese bump atómico fue retirado inmediatamente de la rama y no forma parte del candidato final. Esta actualización documental fuerza una nueva certificación del SHA final limpio y versionado antes de cualquier backup, merge o despliegue.

## Pendiente del frente visual

Este bloque visual está cerrado al 100% para el alcance de REL-054, pero no declara cerrada toda la auditoría de arte. Siguen fuera de alcance inmediato:

- migración completa de literales de color/radio/sombra a tokens semánticos (ART-001);
- racionalización de breakpoints históricos restantes (ART-003);
- reducción de superficies anidadas por módulo (ART-005);
- revisión final de backgrounds semánticos y tema (ART-008/ART-010).

REL-054 sólo se considerará publicada cuando el SHA final versionado tenga CI exacta verde, exista backup restaurable, se publique de forma controlada y el Production Postflight termine correctamente.