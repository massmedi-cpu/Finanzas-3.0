# Financial App — Arquitectura canónica

Este documento define el criterio técnico vigente del código activo. No sustituye al Prompt Maestro AXIOMA: lo materializa en reglas verificables de arquitectura.

## Principios

- Una sola implementación canónica por responsabilidad.
- El código runtime no conserva capas versionadas ni implementaciones sustituidas.
- Los estilos globales se limitan al shell y primitivas compartidas; cada módulo carga sus estilos en su propia ruta.
- La versión de producto (`lib/app-version.ts`) es independiente de la versión técnica del paquete npm.
- Las regresiones históricas se conservan como pruebas, no como arquitectura runtime.
- La fuente de datos y la lógica financiera permanecen en servidor/base de datos; la UI no crea una segunda fuente de verdad.
- Las sugerencias automáticas no modifican datos financieros sin una acción explícita del usuario.
- Las correcciones se realizan sobre la causa raíz y eliminan la implementación sustituida.

## Estilos canónicos por dominio

- Análisis: `app/analysis.css`
- Plan + horizonte: `app/plan.css`
- Presupuesto: `app/budget.css`
- Movimientos: `app/movements.css`
- Cash Flow: `app/cash-flow.css`
- Control: `app/control.css` + `app/control/integrity.css`, ambos limitados a `/control`
- Explicabilidad: `app/explicabilidad/explainability.css`, limitado a `/explicabilidad`

No deben existir hojas `*-vNNN.css` ni `*-advanced.css` en código activo.

## OCR

La API de importación usa exclusivamente el alias `@/lib/document/ticket-ocr`, resuelto al motor canónico `lib/document/ticket-ocr-engine.ts`. Implementaciones sustituidas no deben permanecer en runtime.

## Validación

`npm run audit:current` valida automáticamente estas reglas antes de ejecutar las pruebas históricas de regresión.
