# 08a · Cierre actual de visualización de datos · 10.0.64

## Alcance

Este documento revalida los hallazgos históricos VIZ-001…VIZ-008 contra el estado real posterior a Financial App 10.0.63. No reescribe la auditoría original: registra qué problemas ya fueron resueltos por releases acumulativas y qué cierre aporta REL-064.

## Revalidación

| Hallazgo | Estado en candidato 10.0.64 | Evidencia actual |
| --- | --- | --- |
| VIZ-001 · lectura exacta Inicio | CERRADO previamente | `FinancialBarChart` usa controles focables/táctiles, `aria-label` exacto por mes y readout persistente. |
| VIZ-002 · neto divergente Cuentas | CERRADO previamente | La tercera pista usa baseline central; positivo nace en 50 % hacia la derecha y negativo en 50 % hacia la izquierda, conservando importe textual. |
| VIZ-003 · exceso de presupuesto | CERRADO previamente | Presupuestos separa progreso base y exceso, mostrando exceso en EUR y porcentaje sobre límite/habitual. |
| VIZ-004 · curva de previsión | CERRADO previamente | `ForecastBalanceChart` representa saldo inicial + eventos proyectados, mínimo, primera tensión y mayor salida, con puntos consultables y tabla alternativa. |
| VIZ-005 · Inicio vs Análisis | CERRADO previamente | Existe `/analysis`; Inicio mantiene una lectura resumida y Análisis concentra comparativas/drill-down. |
| VIZ-006 · referencias de escala | CANDIDATO REL-064 | Inicio expone `Escala máxima` respetando privacidad; Cuentas expone la escala máxima común del periodo. Análisis ya dispone de cinco ticks monetarios + línea cero. |
| VIZ-007 · color como canal | CANDIDATO CERRADO | Neto de Cuentas comunica signo por dirección; Inicio y Cuentas exponen etiquetas/valores exactos accesibles además del color; Análisis añade texto, línea cero, tablas y estados. |
| VIZ-008 · primitivas comunes | CERRADO previamente | Existen `FinancialBarChart`, `FinancialTrendChart`, `ContributionChart` y `ForecastBalanceChart`, además de estilos y contratos compartidos. |

## Cambios REL-064

### Inicio

- Mantiene el gráfico compacto y su selección por tap/teclado.
- Añade una referencia visible `Escala máxima <importe>` para que la altura relativa tenga orden de magnitud económico.
- Cuando privacidad oculta importes, no filtra el máximo real: muestra `Escala protegida por privacidad`.
- La leyenda y la referencia dejan de estar ocultas a tecnología asistiva; sólo los puntos cromáticos son decorativos.

### Cuentas

- Añade `Escala máxima <importe>` a la leyenda de actividad mensual.
- Cada fila mensual expone una descripción accesible completa con ingresos, gastos y balance neto exactos.
- Se preserva el baseline central divergente del neto: positivo a la derecha, negativo a la izquierda.

## Contrato verificable

`scripts/verify-data-visualization-10.0.64.mjs` bloquea regresiones de:

- referencia de escala en Inicio y Cuentas;
- privacidad de la escala en Inicio;
- leyendas accesibles;
- resumen mensual exacto en Cuentas;
- dirección divergente del neto;
- ticks + alternativa tabular en Análisis;
- alternativa tabular de la curva de Previsión.

## Restricciones conservadas

- No se recalculan reglas financieras en el navegador: sólo se representa el snapshot existente.
- No se añade una librería gráfica externa ni peso de bundle innecesario.
- EUR/es-ES y fuente bancaria de solo lectura permanecen invariantes.
- REL-064 no toca persistencia, OCR, importación ni reglas contables.

## Estado

Candidato funcional REL-064: **PENDIENTE DE CERTIFICACIÓN CI**.

Una vez el candidato exacto supere contrato visual, TypeScript, build y matriz responsive, VIZ-006/VIZ-007 podrán considerarse cerrados y la ronda histórica VIZ-001…VIZ-008 quedará revalidada contra el producto actual.
