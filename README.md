# Financial App

Construcción desde cero de una nueva Financial App.

## Versión actual

`0.0.1`

## Objetivo de versión

La aplicación avanzará mediante versiones incrementales desde `0.0.1`. La versión `10.0.0` se reservará exclusivamente para el primer estado completo, estable y validado de la nueva aplicación.

Hasta alcanzar ese hito, cada versión representa progreso de construcción, integración, corrección o validación. No se debe marcar la aplicación como `10.0.0` antes de completar y validar el alcance funcional acordado.

A partir de `10.0.0`, las mejoras posteriores seguirán versionado incremental normal: `10.0.1`, `10.1.0`, `11.0.0`, etc., según el impacto de los cambios.

## Regla de reconstrucción

La rama activa no reutiliza código funcional heredado de la aplicación anterior salvo decisión explícita. El proyecto y el dominio de producción de Vercel sí se conservan para mantener continuidad de infraestructura y URL.
