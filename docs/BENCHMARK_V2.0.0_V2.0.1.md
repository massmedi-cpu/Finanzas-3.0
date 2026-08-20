# Benchmark controlado V2.0.0 vs V2.0.1

Fecha: 2026-08-20

## Método

Prueba manual repetida sobre producción V2.0.0 y preview V2.0.1 con la misma fuente de 3.133 movimientos. Recorrido: Inicio → Movimientos → Plan → Informes → Previsión → Inicio, con repetición y prueba adicional tras más de 60 segundos de inactividad. Se cruzaron logs de Vercel y Supabase.

## Resultado medido

### Precarga de rutas al inicio

- V2.0.0: se observaron peticiones automáticas a 9 rutas privadas distintas al cargar Inicio.
- V2.0.1 probada: se observaron 4 rutas privadas precargadas de forma residual: Previsión, Recurrentes, Revisión y Objetivos.
- Reducción medida en rutas privadas precargadas: 5 de 9, aproximadamente 56%.
- Causa residual localizada en enlaces internos de DashboardInsights; corregida después del benchmark con `prefetch={false}`.

### Espera de datos en una navegación real a Plan

V2.0.0 ejecutó de forma prácticamente secuencial fuente, estado, splits y recurrentes. La ventana observada fue aproximadamente 2,295 s desde el inicio de la primera lectura hasta el final de la última.

V2.0.1 lanzó esas lecturas en paralelo. En una navegación equivalente las cuatro lecturas arrancaron prácticamente a la vez y la ventana quedó dominada por la más lenta, aproximadamente 0,777 s.

Mejora medida de la espera de backend en ese caso: aproximadamente 66%.

### Endpoint /source en uso normal

- V2.0.0, muestra del recorrido: mediana aproximada 0,913 s; media aproximada 1,041 s; pico 2,155 s.
- V2.0.1, tramo normal antes de la prueba de inactividad: mediana aproximada 0,768 s; media aproximada 0,810 s; pico 1,336 s.
- Mejora de mediana observada: aproximadamente 16%.
- Mejora de media observada: aproximadamente 22%.

### Prueba tras inactividad

V2.0.1 NO supera todavía el criterio de cierre. Tras la espera se registraron picos de:

- `finanzas-v3-data/state`: 11,228 s.
- `finanzas-v3-splits/splits`: 6,943 s y 5,748 s.
- `finanzas-v3-bridge/source`: 6,117 s.
- una validación contra el backend legado: 5,341 s.

La investigación posterior confirmó que las Edge Functions realizan una validación remota del mismo token y que la ruta de prueba del backend legado continúa hasta el upstream en vez de terminar localmente después de autenticar. Este comportamiento amplifica los cold starts o retrasos de red.

## Acciones posteriores al benchmark

- Eliminada la precarga residual de los enlaces internos de DashboardInsights.
- Paralelizadas las lecturas del DashboardInsights inicial.
- Paralelizada la lectura de fuente y estado en FinancialSummary.
- CI posterior a estas correcciones: verde.

## Veredicto

La V2.0.1 demuestra una mejora real y cuantificable en navegación normal, especialmente por paralelización, pero no debe promoverse a producción todavía porque la prueba de inactividad reveló picos de latencia críticos ligados a la validación remota de sesión. El benchmark queda como evidencia de aceptación/rechazo y como baseline para la siguiente iteración.
