# Release gate — Financial App 2.4.0

Estado: CANDIDATA DE DESARROLLO. No desplegada.

## Base protegida

2.4.0 parte del head 2.3.0 ya validado por CI completo y acumula 2.2 Analítica + 2.3 Inteligencia. Producción continúa estable en 2.1.0. La rama `develop/v2.4.0-long-horizon` mantiene Vercel bloqueado para evitar previews y consumo innecesario.

El antiguo gate V2.4.0 de la arquitectura previa al rebuild se conserva en `docs/legacy/RELEASE_GATE_V2.4.0_PRE_REBUILD.md` y no es una especificación activa.

## Objetivo

Añadir planificación de medio/largo plazo sin presentar como previsión bancaria una extrapolación que no esté respaldada por eventos confirmados.

## Garantías 2.4

- Horizonte de capacidad visible a 3, 6 y 12 meses.
- Usa exclusivamente la capacidad mensual canónica del Plan y el esfuerzo mensual requerido por objetivos.
- El margen de cada horizonte es una multiplicación lineal documentada; nunca se etiqueta como saldo futuro.
- El saldo bancario previsto continúa limitado a los 90 días canónicos de Previsión.
- La proyección de patrimonio continúa limitada a 90 días.
- No existen campos de saldo a 180/365 días ni patrimonio a 365 días en el motor 2.4.
- Se muestra el pendiente total de objetivos y los meses matemáticos al ritmo requerido, sin sustituir sus fechas objetivo individuales.
- La sostenibilidad distingue objetivos compatibles con capacidad, objetivos por encima de capacidad y ausencia de objetivos activos.
- La nueva ruta `/plan/horizonte` es privada y reutiliza el Plan canónico; no añade RPC ni escrituras.
- El Plan enlaza el nuevo horizonte desde la capa inteligente.

## Gate técnico

- Todos los gates 1.7 → 2.3 siguen pasando.
- `audit:v240`.
- `test:horizon`.
- recuperación portable, accesibilidad, typecheck y build de producción.
- `package.json`, lockfile y runtime coherentes en 2.4.0.
- Sin despliegues Vercel de desarrollo.

## Promoción futura

Esta candidata no se fusiona ni despliega automáticamente. Antes de convertir 2.4.0 en estable se repetirá el gate completo contra `main`, release readiness de Supabase y un único despliegue de producción. Hasta entonces 2.1.0 sigue siendo la versión publicada y recuperable.
