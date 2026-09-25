# 33 · PRE-022 — separación de histórico, límite y objetivo

Fecha: 2026-09-25 (Europe/Madrid)

## Estado

**IMPLEMENTACIÓN COMPLETADA EN LA RAMA DE RECUPERACIÓN. GATE VISUAL DE NAVEGADOR PENDIENTE DE EVIDENCIA.**

Este addendum es posterior a la segunda beta heurística del 10 de septiembre. No reescribe aquella evidencia: registra el tratamiento del único recorrido que entonces permanecía parcial, Presupuestos.

## Problema resuelto

La interfaz anterior utilizaba la media de gasto de los tres meses completos como “límite automático”. Aunque el cálculo era correcto, podía interpretarse como una recomendación adecuada. Tampoco relacionaba el límite elegido con los ingresos históricos ni mostraba el ahorro que implicaría.

El nuevo contrato separa explícitamente:

1. **Referencia histórica:** media de gasto elegible de los tres meses completos anteriores. Describe el pasado y nunca se presenta como recomendación.
2. **Límite elegido:** sólo existe cuando el usuario introduce un importe manual total. Si falta, la referencia histórica continúa sirviendo para comparar, pero no se convierte en objetivo.
3. **Objetivo de ahorro resultante:** ingreso mensual medio menos límite elegido, con importe y porcentaje. Es una proyección determinista, no asesoramiento financiero.

## Composición con fuentes de verdad existentes

- Presupuesto, gasto real e histórico continúan procediendo de `budget.snapshot`.
- Los ingresos proceden de `financial.monthly` para exactamente los mismos tres meses completos.
- La API `/api/budgets` obtiene ambas lecturas con una única resolución de identidad en GET.
- Antes de calcular el objetivo, el modelo exige que los tres gastos mensuales de ambas fuentes coincidan y que su media reproduzca `automaticAmountCents`.
- La fuente bancaria permanece estrictamente en solo lectura.
- No se añade tabla, migración ni cálculo financiero paralelo en React.

## Fallo cerrado y degradación parcial

- Serie de ingresos ausente: límites y gasto siguen disponibles; el objetivo se marca como no disponible.
- Meses o importes que no concilian: estado `mismatch`; no se muestra una cifra de ahorro.
- Ingreso medio cero: estado `no_income`; no se fabrica sostenibilidad.
- Sin límite elegido: estado `needs_limit`; la media histórica no se eleva artificialmente a objetivo.
- Respuesta de presupuesto inválida: la API rechaza el contrato como fallo upstream (`502`) antes de componer la planificación; no lo atribuye al usuario.

## Interfaz

Presupuestos presenta ahora el recorrido “De lo habitual a tu objetivo” con tres pasos, diferencia en euros respecto al gasto habitual, ahorro objetivo y tasa sobre ingreso medio. Las tarjetas de total y categoría distinguen también entre referencia histórica y límite elegido. Se conserva la edición, el formato `es-ES`, el detalle causal hacia Movimientos y el comportamiento read-only de la fuente.

## Evidencia ejecutada

- `npm run typecheck`: **SUCCESS**.
- `npm run build`: **SUCCESS**, incluida compilación de `/budgets` y `/api/budgets`.
- Contratos PRE-022 + validación API/gateway: **9 passed, 0 failed**.
- Servidor de producción local: `/budgets` → **HTTP 200**, HTML no vacío y copy nuevo presente.
- Validación negativa: `/api/budgets?month=2026-13` → **HTTP 400** con `invalid_budget_month`.
- `git diff --check`: sin errores de whitespace.

## Gate que no se declara superado

La ejecución visual Playwright no pudo iniciarse porque el entorno no contiene el binario Chromium requerido. El verificador alternativo `agent-browser` tampoco consiguió iniciar su daemon en dos intentos. Por tanto, no se inventa evidencia de captura, consola, hidratación o interacción.

Quedan preparados y actualizados los recorridos E2E de Presupuestos, accesibilidad y visualización. El cierre técnico total de PRE-022 requiere ejecutarlos en desktop y móvil cuando exista navegador disponible. No se ha consumido otro despliegue de Vercel para suplir esta carencia y `main`/Production permanecen sin cambios.
