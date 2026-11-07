# REC-UI-ONBOARD-188 · Primeros pasos claro/oscuro · 18/10/2026

## Evidencia visual
La inspección manual de las capturas sintéticas y no sensibles del artefacto de la matriz `bf920718` (run 39143709598) detectó un defecto de contraste en `/onboarding` con tema claro: navegación clara, pero lienzo central y paneles de degradado oscuro fijo con textos que adoptaban el primer plano oscuro de `html[data-theme="light"]`. La pantalla no era legible pese a las regresiones automáticas verdes.

## Corrección
`app/onboarding/onboarding.module.css` elimina el fondo fijo de `.shell` y reutiliza el lienzo de `app/app-background.css`. `.hero`, `.nextAction` y `.card` componen gradientes con `--surface-card` y `--color-primary-bright`, adaptativos a claro/oscuro. `.stepNumber` usa fondo primario opaco y `--color-on-primary` para eliminar texto blanco sobre una insignia casi transparente. Se mantienen todas las condiciones de negocio, rutas y estados bloqueados del onboarding.

## Prueba y límites
`REC-UI-ONBOARD-188` en `tests/e2e/product-recovery-visual.spec.ts` verifica en Chromium los temas claro/oscuro, lienzo único, gradientes semánticos y contraste ≥4,5:1 del número de paso. Exige posterior inspección de capturas regeneradas (incluidos tamaños móvil), matriz completa de 21 rutas y aceptación visual del propietario antes de cerrar AP3/AP4. No se ha utilizado dato bancario ni modificado producción.
