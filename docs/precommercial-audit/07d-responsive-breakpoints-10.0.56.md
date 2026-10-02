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

## Inventario real de excepciones de contenido

El primer guard de 10.0.56 se ejecutó deliberadamente en modo estricto para inventariar todos los valores reales existentes. La auditoría de septiembre citaba 420px, 600px, 680px, 900px, 1050px y 1180px como ejemplos históricos; esos valores **no se permiten por defecto si ya no existen en el CSS actual**.

La línea base real de 10.0.56 conserva exclusivamente estas excepciones existentes, con su necesidad de contenido:

- 352px — gráfica de barras en móvil mínimo.
- 384px — análisis compacto.
- 400px — buscador global y recurrentes compactos.
- 430px — cuentas en móvil amplio.
- 432px — Inicio compacto.
- 440px — calendario y previsiones compactas.
- 512px — frescura de fuente en análisis.
- 520px — configuración y Patrimonio compactos.
- 544px — Apariencia y navegación contextual.
- 560px — Fuente simple compacta.
- 576px — explicación de cifras compacta.
- 608px — Comparador compacto.
- 620px — Presupuestos, comercios y Fuente.
- 640px — feedback global y Recurrentes.
- 672px — Revisión y gráfica de contribución.
- 700px — Documentos y OCR.
- 720px — Cuentas, Cash Flow y Previsiones.
- 760px — Alertas.
- 784px — instalación PWA.
- 800px — Patrimonio.
- 832px — Comparador y Apariencia.
- 850px — revisión OCR.
- 860px — Fuente simple.
- 880px — Comercios.
- 928px — Análisis, navegación contextual y Recurrentes.
- 980px — Presupuestos, Fuente y OCR.
- 1080px — Previsiones.
- 1120px — Cash Flow e Inicio.
- 1152px — Análisis y tema premium.
- 1216px — Recurrentes.
- 1248px — controles de categoría y Comparador.

Estos valores no se convierten en tokens globales: quedan **congelados como deuda heredada justificada**. Un módulo nuevo no puede reutilizarlos sólo porque ya existan; debe preferir el sistema salvo que el contenido demuestre una necesidad propia.

Cada excepción futura debe cumplir una de estas dos rutas:

1. reutilizar un breakpoint del sistema si la transición es equivalente; o
2. quedar documentada como necesidad específica de contenido antes de permitirse en el guard.

## Guard permanente

`scripts/verify-responsive-breakpoints.mjs` recorre CSS de `app/` y `src/`, inspecciona condiciones `@media` con ancho de viewport y falla ante cualquier breakpoint que no pertenezca al contrato, a la transición técnica 48.01rem o al inventario cerrado de excepciones documentadas.

También protege explícitamente las tres transiciones principales del AppShell y comprueba que el contrato TypeScript conserve los siete límites de sistema. El guard se ejecuta en `postbuild`, de forma que una compilación de Producción no puede certificar un nuevo breakpoint arbitrario.

## Regresión

La matriz Playwright existente sigue verificando los cruces críticos 479/481, 767/768/769 y 1439/1440/1441, además de 360, 430, 600, 820, 1024, 1366, 1920 y 2560.

El objetivo de REL-056 no es rediseñar simultáneamente decenas de layouts heredados. Es establecer la gobernanza que faltaba, congelar la dispersión actual y permitir migraciones posteriores de excepciones hacia los límites del sistema con regresión visual controlada.

ART-003 no cambia semántica financiera, persistencia, autenticación, PWA ni la fuente bancaria oficial. Google Drive/Sheets permanece en solo lectura.
