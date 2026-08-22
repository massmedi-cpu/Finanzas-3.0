# Financial App 2.1.0 — release candidate

## Alcance

2.1.0 evoluciona la base estable 2.0.1 sin cambiar las reglas financieras ni el origen bancario de solo lectura.

### Navegación y legibilidad
- Prefetch automático global sustituido por prefetch por intención del usuario.
- Navegación compacta protegida a un mínimo efectivo de 13 px.
- Etiquetas `eyebrow` protegidas a 12 px.

### Shell persistente
- Eliminados 16 `AppSidebar` internos redundantes.
- Un único sidebar principal permanece en `AppChrome`.
- Auditoría de accesibilidad alineada con esta arquitectura.

### Movimientos
- Primera carga conserva todas las facetas.
- Paginaciones y filtros posteriores reutilizan las facetas ya cargadas y omiten su reenvío.
- Baseline medido y documentado en `docs/PERFORMANCE_V2.1.0.md`.
- La RPC estable existente permanece como fuente de verdad; no se introdujo una duplicación SQL de mayor riesgo.

### Plan y coherencia
- Plan continúa usando una única RPC pública y los motores canónicos de Presupuesto, Previsión, Objetivos, Patrimonio y Control.
- Smoke sobre la base real confirmó coincidencia de las magnitudes compartidas.
- Las prioridades mantienen `sourcePath` y navegación al módulo operativo.
- Inicio usa un horizonte inmediato de 30 días y Plan un horizonte explícito de 90 días.

## Protección de regresiones

`audit:v210` se ejecuta junto a los gates heredados de 1.7, 1.8, 1.9, 2.0 y 2.0.1, además de accesibilidad, recuperación, typecheck y build.

## Promoción

Este documento pertenece al commit candidato que debe superar CI completo antes de ser promocionado a `main`. La versión de base de datos se actualiza a 2.1.0 únicamente después de que el despliegue de ese commit quede READY, evitando desalinear la 2.0.1 aún activa durante el proceso.
