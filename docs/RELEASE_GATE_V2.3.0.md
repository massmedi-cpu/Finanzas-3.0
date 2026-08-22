# Release gate — Financial App 2.3.0

Estado: CANDIDATA DE DESARROLLO. No desplegada.

## Base protegida

2.3.0 parte del head 2.2.0 ya validado por CI completo. Producción continúa en 2.1.0 y la rama `develop/v2.3.0-intelligence` no genera Preview de Vercel.

## Objetivo

Añadir una capa de inteligencia financiera determinista que conecte señales de Presupuesto, Previsión, Objetivos, Patrimonio, Control y, únicamente en el mes actual, contexto de Análisis 2.2.

## Garantías 2.3

- No usa un modelo externo ni genera cifras nuevas mediante IA.
- No ejecuta mutaciones financieras ni escribe sobre movimientos, presupuesto, previsión u objetivos.
- Cada señal conserva `sourcePath` y enlace al módulo operativo que la origina.
- Liquidez negativa confirmada tiene prioridad crítica.
- Déficit mensual + déficit previsto, presupuesto proyectado en negativo, objetivos por encima de capacidad y bloqueos de cierre elevan la prioridad de forma explícita.
- La confianza baja cuando existen duplicados, bloqueos de cierre o cobertura patrimonial incompleta; baja a media con revisión, conciliación o gasto sin presupuesto pendientes.
- El contexto analítico solo se mezcla con el Plan cuando se consulta el mes actual para evitar comparaciones temporales incoherentes.
- Una oportunidad solo se muestra si no existen señales críticas/altas y hay resultado, capacidad tras objetivos y mínimo previsto no negativos.

## Gate técnico

- Todos los gates 1.7 → 2.2 siguen pasando.
- `audit:v230`.
- `test:intelligence`.
- recuperación, accesibilidad, typecheck y build de producción.
- Sin despliegues Vercel de desarrollo.

## Siguiente paso

2.4.0 añadirá un horizonte de planificación de 3, 6 y 12 meses basado en capacidad ya calculada. No extrapolará el saldo bancario más allá de los 90 días canónicos de Previsión.
