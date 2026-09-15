# Auditoría Premium · Presupuestos

Base auditada: `main` / Production `993815dba486566c897562c1a895a780e381f4b7`.

## Invariantes que se conservan

- `budget.snapshot` es la fuente central de lectura del mes.
- `budget.refresh` es una persistencia explícita solicitada por el usuario.
- `budget.set_manual` mantiene el override manual y su auditoría.
- La fuente bancaria permanece `read_only`.
- Transferencias internas, duplicados confirmados y exclusiones manuales no consumen presupuesto.
- Las categorías padre incluyen descendientes sin duplicar gasto.
- La recomendación automática y el límite manual permanecen separados.

## Problemas encontrados en la superficie anterior

- Carga inicial exclusivamente cliente, con spinner y petición adicional al abrir la pantalla.
- Contrato `BudgetSnapshot` duplicado dentro del componente React.
- Protección ante respuestas tardías basada en generación, sin cancelación real de la petición anterior.
- Un cliente monolítico concentra contrato, parsing, fetching, mutaciones, edición, tarjetas e histórico.
- La jerarquía prioriza una sucesión de tarjetas antes que los problemas que requieren atención.
- La explicación metodológica ocupa un panel principal pese a ser información secundaria de consulta.
- Estilos con numerosos colores y medidas locales en lugar de los tokens globales del producto.
- Pruebas de Preview históricas anteriores al aislamiento obligatorio de workspace.

## Dirección aplicada

- Contrato y validación centralizados en `src/application/budgets`.
- Loader servidor para snapshot inicial y fallback cliente seguro.
- Cancelación real con `AbortController`, conservando guard de secuencia.
- Resumen compacto y categorías ordenadas por riesgo/consumo.
- Bloque `Necesita atención` derivado únicamente del snapshot central, sin inventar datos.
- Método de cálculo relegado a información secundaria desplegable.
- Matriz responsive 360/430/768/1024/1280/1440 y targets de 44 px como gates.
- Preview protegido debe fallar cerrado sin workspace; no se introduce bypass de usuario.
