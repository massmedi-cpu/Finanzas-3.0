# Baseline de rendimiento — frontend V2.0.0

Fecha de prueba: 2026-08-20
Ventana observada: aproximadamente 18:34–18:36 UTC (20:34–20:36 Europe/Madrid).
Frontend probado: V2.0.0 de producción (`dpl_4fewri98NAqqgqGEKrCuW66gAr1D`).
Backend durante esta medición: `finanzas-v3-bridge` V4 ya desplegado.

## Objetivo

Fijar una línea base reproducible para comparar la navegación del frontend V2.0.0 con V2.0.1 en igualdad de datos y backend.

## Evidencia de precarga masiva

En la entrada de la aplicación, a las 18:34:14 UTC, Vercel registró solicitudes simultáneas a prácticamente todas las rutas privadas visibles, entre ellas:

- `/movimientos`
- `/plan`
- `/cuentas`
- `/presupuestos`
- `/recurrentes`
- `/prevision`
- `/informes`
- `/objetivos`
- `/revision`

Varias rutas aparecieron además duplicadas en la misma ventana. Esto confirma que el frontend V2.0.0 genera trabajo anticipado no solicitado por el usuario.

## Muestra del endpoint de fuente

Durante el recorrido de navegación, las llamadas observadas a `finanzas-v3-bridge/source` tuvieron, en una muestra de 16 peticiones:

- mínimo: 680 ms
- mediana: 912,5 ms
- media: 1.040,6 ms
- máximo: 2.155 ms

Estas cifras NO deben compararse con el antiguo bridge V3 porque V4 ya estaba activo durante esta prueba. Sí son válidas como baseline para comparar el número de llamadas y el tiempo de navegación del frontend V2.0.0 frente a V2.0.1 usando el mismo backend.

## Otros endpoints observados

Durante la navegación también se repitieron llamadas a:

- `finance-v3-data/state`
- `finanzas-v3-recurring/preferences`
- `finanzas-v3-splits/splits`
- validaciones de sesión contra el backend legado

Se observaron pares de peticiones muy próximas en tiempo, coherentes con el patrón de precarga y solicitudes duplicadas del frontend actual.

## Criterio de comparación con V2.0.1

La prueba V2.0.1 debe repetir el mismo recorrido y medir:

1. número total de solicitudes por ruta;
2. número de llamadas a `/source`, `state`, `recurring` y `splits`;
3. peticiones duplicadas o anticipadas;
4. mediana y peor tiempo de `/source`;
5. ausencia de precarga masiva al entrar en Inicio;
6. tiempo percibido y de servidor en cambios de sección.

La mejora solo se declarará demostrada si los registros posteriores muestran una reducción objetiva de trabajo redundante y/o tiempos de navegación, no por percepción subjetiva.
