# Release gate — Financial App 2.2.0

Estado: CANDIDATA DE DESARROLLO. No desplegada.

## Base protegida

Financial App 2.1.0 permanece estable en producción. Esta rama parte exactamente del merge estable de 2.1.0 y no genera Preview de Vercel.

El antiguo gate V2.2.0 de la arquitectura previa al rebuild se conserva en `docs/legacy/RELEASE_GATE_V2.2.0_PRE_REBUILD.md` y no es una especificación activa.

## Objetivo

Convertir Análisis en una capa comparativa útil sin introducir nuevas fuentes de verdad ni fórmulas financieras opacas.

## Garantías 2.2

- Las medias y referencias anuales usan únicamente meses completos comparables.
- Un mes parcial nunca se anualiza ni se mezcla con la media mensual.
- La referencia anual es una extrapolación lineal documentada, no una previsión bancaria.
- Se calculan tasa de ahorro media, gasto mensual medio, variabilidad, tendencia reciente, concentración y cobertura de categorización.
- Mejor/peor mes se calcula solo entre meses completos.
- Todos los cálculos se derivan del overview canónico de Análisis; no escriben movimientos ni modifican el origen.
- La interfaz mantiene drill-down a Movimientos y las exclusiones de ahorro, traspasos y duplicados.

## Gate técnico

- `npm ci` reproducible y árbol de dependencias válido.
- Auditorías heredadas 1.7 → 2.1.
- `audit:v220`.
- `test:analytics`.
- recuperación, accesibilidad, typecheck y build de producción.
- Sin despliegue a Vercel mientras 2.2 sea rama de desarrollo.

## Siguiente paso

2.3.0 reutilizará estas métricas y el Plan canónico para construir una capa de inteligencia determinista y explicable. No se fusionará 2.2 a producción por separado si 2.3/2.4 continúan avanzando en el mismo ciclo.
