# Financial App 2.1.0 — coherencia del Plan

## Objetivo

El Plan resume datos producidos por los motores canónicos de Presupuesto, Previsión, Objetivos, Patrimonio y Control, manteniendo trazabilidad hacia cada módulo operativo.

## Fuentes canónicas comprobadas

`financial_app.plan_overview_core()` reutiliza `budget_overview_core`, `forecast_overview_core`, `goals_overview_core`, `net_worth_overview_core` y `control_center_core`. La aplicación obtiene el conjunto mediante una única RPC pública: `financial_app_plan_overview`.

## Smoke de coherencia

La comparación sobre la base real dio coincidencia en todas estas magnitudes: ingresos, gastos y neto mensual; presupuesto asignado, gastado y disponible; saldo y mínimo previstos a 90 días; aportación mensual de objetivos; patrimonio actual; magnitudes compartidas con Inicio; recuento de prioridades; y trazabilidad de cada prioridad mediante `sourcePath` y `href` interno.

## Horizontes temporales

Inicio muestra `PRÓXIMOS 30 DÍAS` y utiliza una previsión a 30 días. Plan etiqueta explícitamente `90 días` y utiliza una previsión a 90 días. La diferencia es intencionada: Inicio ofrece contexto inmediato y Plan planificación a medio plazo.

## Garantía 2.1

React puede formatear o calcular porcentajes visuales, pero no reimplementa reglas financieras. Cada recomendación muestra su `sourcePath` y enlaza al módulo operativo correspondiente. Plan sigue siendo una capa de decisión de solo lectura. `audit:v210` protege la RPC única, la trazabilidad y la diferenciación entre 30 y 90 días.
