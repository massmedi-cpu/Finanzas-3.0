# ART-003 · Breakpoints responsive gobernados · Financial App 10.0.56

## Objetivo

Cerrar ART-003 sin convertir todos los cambios de layout en un único número. El sistema distingue entre **breakpoints reutilizables de producto** y **excepciones locales justificadas por el contenido**.

## Breakpoints de sistema

La fuente TypeScript canónica es `src/design/responsive-breakpoints.ts`:

- `compactPhone`: 360px
- `compact`: 480px
- `mobileMax`: 768px
- `content`: 1024px
- `dense`: 1280px
- `wide`: 1440px
- `ultraWide`: 1728px

Estos valores describen límites reutilizables del producto. No obligan a que cada módulo cambie de composición en todos ellos.

## Transiciones semánticas del AppShell

El AppShell mantiene sus límites ya certificados por la matriz responsive:

- 30rem = 480px: composición móvil muy compacta.
- 48rem = 768px: último ancho del modo de navegación móvil.
- 48.01rem ≈ 768,16px: inicio técnico del rango desktop sin solapar `max-width: 48rem`; en la matriz de píxeles enteros, desktop comienza en 769px.
- 90rem = 1440px: límite superior del tratamiento intermedio de la navegación desktop.

CSS no permite consumir de forma interoperable una custom property en la condición de `@media`; por eso los literales de la condición se mantienen, pero quedan ligados al contrato mediante un guard de CI.

## Excepciones de contenido heredadas

La auditoría inicial detectó breakpoints locales que no deben ascender automáticamente a contrato global: 420px, 600px, 680px, 900px, 1050px y 1180px.

Se conservan temporalmente como excepciones de contenido porque reflejan puntos donde una tabla, gráfica, panel o agrupación concreta necesita reflujo. Su presencia no autoriza nuevos valores arbitrarios.

Cada excepción futura debe cumplir una de estas dos rutas:

1. reutilizar un breakpoint del sistema si la transición es equivalente; o
2. quedar documentada como necesidad específica de contenido antes de permitirse en el guard.

## Guard permanente

`scripts/verify-responsive-breakpoints.mjs` recorre CSS de `app/` y `src/`, inspecciona condiciones `@media` con ancho de viewport y falla ante cualquier breakpoint que no pertenezca al contrato o a las excepciones documentadas.

También protege explícitamente las tres transiciones del AppShell y comprueba que el contrato TypeScript conserve los siete límites de sistema.

## Regresión

La matriz Playwright existente sigue verificando los cruces críticos 479/481, 767/768/769 y 1439/1440/1441, además de 360, 430, 600, 820, 1024, 1366, 1920 y 2560.

ART-003 no cambia semántica financiera, persistencia, autenticación, PWA ni la fuente bancaria oficial. Google Drive/Sheets permanece en solo lectura.
