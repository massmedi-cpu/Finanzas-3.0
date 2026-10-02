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
- No se modifica la semántica financiera ni el cálculo de patrimonio.

### ART-002 · mínimo tipográfico compartido

Se consolida `--font-helper: 0.8125rem` como mínimo operativo compartido en `app/globals.css` y se eliminan tamaños literales inferiores en los componentes globales de Configuración:

- contador de tabs;
- `panel-kicker`;
- chips de estado y ciclo de vida;
- ayudas de campo.

El objetivo es que información necesaria para comprender estado, contexto o acción no caiga por debajo de 13 px en la superficie global compartida.

**Estado REL-054:** CERRADO para estilos globales compartidos. La migración de CSS Modules históricos continúa siendo un frente posterior y no se declara cerrada para todo el repositorio.

### ART-007 · familia tipográfica explícita

La hoja global deja de prometer `Inter` sin cargarla. Se introduce `--font-family-ui` con una pila explícita de sistema y `body` consume ese token.

**Estado REL-054:** CERRADO a nivel de contrato global. Cualquier futura tipografía de marca deberá cargarse de forma explícita y certificada antes de sustituir este contrato.

### Guard automático

Se añade `scripts/verify-premium-design-system.mjs`, que falla si:

1. `--font-helper` baja de `0.8125rem`;
2. aparece en `app/globals.css` un `font-size` literal inferior al mínimo compartido;
3. `body` deja de consumir `--font-family-ui`;
4. se vuelve a declarar `Inter` sin carga explícita en el token global;
5. `Patrimonio` desaparece de navegación o de la precarga principal.

El comando canónico es `npm run verify:premium-design`.

## Certificación REL-054

El workflow `Release 10.0.54` ejecuta sobre el SHA exacto del PR:

- guard de sistema visual premium;
- TypeScript;
- build de producción;
- matriz responsive existente en Chromium.

No se hará bump a `10.0.54`, merge, backup, publicación ni postflight hasta que el candidato funcional esté certificado.

## Pendiente del frente visual

Este bloque no declara cerrada toda la auditoría de arte. Siguen fuera de alcance inmediato:

- migración completa de literales de color/radio/sombra a tokens semánticos (ART-001);
- racionalización de breakpoints históricos restantes (ART-003);
- reducción de superficies anidadas por módulo (ART-005);
- revisión final de backgrounds semánticos y tema (ART-008/ART-010).

El siguiente incremento de REL-054 debe ampliar la garantía tipográfica a CSS Modules prioritarios y corregir sólo los casos que afecten información financiera o acciones necesarias, evitando una refactorización estética indiscriminada.
