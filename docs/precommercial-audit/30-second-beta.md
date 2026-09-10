# 30 · Segunda beta heurística

Fecha: 2026-09-10 (Europe/Madrid)

## Método comparable

Se repiten los mismos ocho perfiles/tareas de `13-beta-initial.md`. No se inventan personas, tiempos, errores por sesión ni satisfacción humana.

Para hacer la mejora medible se fija una rúbrica simple y reproducible sobre el resultado funcional observado y su evidencia automatizada:

- 0 = tarea falla.
- 1 = tarea parcial / funcional con bloqueo o fricción relevante.
- 2 = tarea resuelta dentro del alcance probado.

Esta puntuación es **heurística de preparación de tarea**, no una métrica de satisfacción de usuario.

## Comparación

| Perfil | Primera ronda | Segunda ronda | Evidencia principal |
|---|---:|---:|---|
| 1 · poco técnico / empezar | 1 | 2 | Onboarding `Primeros pasos`, estados de fuente/cuentas y secuencia guiada |
| 2 · comprender gasto | 0 | 2 | Análisis con comparación, drivers y drill-down |
| 3 · móvil / cambiar módulos | 1 | 2 | AppShell móvil, 360/430/480, targets y cero overflow |
| 4 · edición masiva | 2 | 2 | flujo ya válido + protección contra respuestas stale |
| 5 · histórico/origen/duplicado | 2 | 2 | filtros, paginación, trazabilidad y revisión de duplicado continúan verdes |
| 6 · presupuestos | 1 | 1 | overrun visual mejora, pero PRE-022 histórico/límite/objetivo sigue pendiente |
| 7 · análisis anual a causas | 0 | 2 | Análisis + visualización + deep-links a Movimientos |
| 8 · intentar romper la app | 1 | 2 | carrera de Movimientos, MIME spoofing y aislamiento Preview/Production corregidos y probados |

### Resultado cuantitativo

- Primera ronda reexpresada con la rúbrica: **8/16 = 50,00 %**.
- Segunda ronda: **15/16 = 93,75 %**.
- Mejora: **+7 puntos sobre 16; +43,75 puntos porcentuales**.

No se reinterpretan los resultados originales para hacerlos parecer mejores: el perfil 6 permanece parcial y los perfiles 4/5 ya funcionaban, por lo que no obtienen puntuación extra artificial.

## Limitación comercial

Esta segunda ronda no sustituye una beta humana. Antes de un lanzamiento público se recomienda una prueba con personas reales, captura de tiempos/abandono/error por tarea y revisión de accesibilidad asistida.

## Estado

**SEGUNDA BETA HEURÍSTICA: COMPLETADA. Mejora medible demostrada sin fabricar datos humanos.**