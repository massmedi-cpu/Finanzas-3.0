# Benchmark controlado V2.0.0 vs V2.0.1

Fecha inicial: 2026-08-20
Validación final: 2026-08-21
Baseline: V2.0.0 producción.
Candidato final: V2.0.1, commit `fa078b800ffbf9cb612d934291f29b767b3f99cf`.
Fuente: 3.133 movimientos.

## Método

Se comparó producción V2.0.0 con previews V2.0.1 usando la misma fuente. Se cruzaron logs de Vercel y Supabase. El recorrido de control incluyó Inicio, Movimientos, Plan, Informes y Previsión, más una comprobación específica después de más de 60 segundos de inactividad.

## Resultados

### Precarga de rutas

V2.0.0 lanzó peticiones anticipadas a 9 rutas privadas al entrar en Inicio. La primera V2.0.1 redujo ese comportamiento a 4 rutas; esas cuatro precargas residuales se localizaron en `DashboardInsights` y se eliminaron con `prefetch={false}`. El HEAD final no presenta el patrón de precarga masiva de V2.0.0.

### Navegación a Plan

En V2.0.0 las lecturas independientes se ejecutaban prácticamente en cadena, con una ventana observada de aproximadamente 2,295 s. V2.0.1 las paralelizó y redujo esa ventana a aproximadamente 0,777 s.

Mejora medida: aproximadamente 66 %.

### `/source` en navegación normal

Baseline V2.0.0 con bridge V4 ya activo:
- mediana: ~0,913 s;
- media: ~1,041 s;
- pico: 2,155 s.

Primera V2.0.1:
- mediana: ~0,768 s;
- media: ~0,810 s;
- pico: 1,336 s.

Mejora observada: ~16 % en mediana y ~22 % en media, antes de las optimizaciones posteriores de caché y región.

## Incidencia detectada durante la auditoría

Una prueba intermedia después de inactividad reveló picos de:
- `state`: 11,228 s;
- `splits`: 6,943 s;
- `/source`: 6,117 s;
- validación de sesión: 5,341 s.

La causa principal era una validación de sesión que atravesaba innecesariamente el backend legado/Cloudflare, junto con trabajo de fuente y navegación repetido.

## Correcciones posteriores

- El probe de sesión se resuelve dentro de Supabase sin atravesar Cloudflare.
- Vercel se ejecuta en `cdg1`, junto a Supabase en París.
- Se reutiliza la fuente validada y se deduplican lecturas concurrentes.
- Se eliminan precargas residuales.
- Se paralelizan lecturas independientes.
- Se eliminan `router.refresh()` redundantes.
- Movimientos limita el DOM a 100 filas iniciales ampliables.

## Validación final del HEAD

Preview: `dpl_GNPrxvQD9Zmvo4NxwNhvzqt5XMUW`, READY, región `cdg1`.

En la navegación autenticada final:
- `state`: 322–383 ms en las últimas lecturas observadas;
- validación de sesión: ~90 ms;
- no se registraron errores de runtime;
- Movimientos → Previsión → Inicio se completó correctamente.

Después del periodo de inactividad, la segunda navegación a Movimientos/Inicio no generó nuevas llamadas a `/source`, `state`, `splits` ni recurrentes. La navegación se resolvió desde el estado/caché de cliente ya disponible, evitando por completo el patrón que antes provocaba el pico de 6–11 segundos.

Comparado con la incidencia intermedia:
- validación de sesión: 5,341 s → ~0,090 s, reducción ~98,3 % cuando se consulta;
- `state`: 11,228 s → 0,322–0,383 s en lecturas reales, reducción aproximada de 96,6–97,1 %;
- espera de backend tras inactividad en la navegación repetida: eliminada, al no ser necesaria una nueva lectura.

## Veredicto

V2.0.1 supera el gate de rendimiento y estabilidad del benchmark. La mejora es objetiva: menos trabajo anticipado, paralelización, colocación regional correcta, validación de sesión de baja latencia y reutilización de datos/navegación ya cargados. No se observaron errores de runtime durante la validación final.
