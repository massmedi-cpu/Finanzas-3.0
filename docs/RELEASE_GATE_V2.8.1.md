# Release gate — Financial App 2.8.1

Estado: CANDIDATA DE HOTFIX sobre Financial App 2.8.0.

## Problema corregido

La gráfica reutilizable `CashFlowChart` se renderizaba en Inicio sin que sus hojas de estilo de Cash Flow estuvieran cargadas. Al tratarse de SVG, los elementos sin `fill`/`stroke` CSS caían a valores por defecto del navegador, produciendo barras, línea y área visualmente negras sobre el modo oscuro.

## Garantías 2.8.1

- [x] `cash-flow.css` y `cash-flow-advanced.css` cargados desde el layout raíz.
- [x] Ingresos y gastos siguen siendo barras.
- [x] Acumulado es línea con `fill:none!important`.
- [x] Ingresos/gastos usan eje izquierdo y acumulado escala/eje derecho independiente.
- [x] Grid y referencia cero del acumulado visibles sin dominar el gráfico.
- [x] Contraste específico de gastos reforzado en dark mode.
- [x] Tooltip, alternancia de series, tabla accesible y drill-down conservados.
- [x] Ninguna fórmula financiera ni dato de origen se modifica.
- [x] Rama de desarrollo sin Preview Vercel.

## Gate técnico

- [ ] `audit:v281` verde.
- [ ] Todos los gates 1.7 → 2.8 verdes.
- [ ] `test:time`, `test:format`, `test:explainability`, `test:integrity` y backup verdes.
- [ ] Accesibilidad y TypeScript verdes.
- [ ] Build de producción reproducible verde.
- [ ] `package.json`, lockfile, `lib/app-version.ts` y README alineados en 2.8.1.
- [ ] Un único despliegue de producción tras merge a `main`.
- [ ] `financialapp-home.vercel.app` responde HTTP 200 y muestra 2.8.1 sin errores runtime.
