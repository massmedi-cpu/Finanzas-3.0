# Inicio · privacidad visual de magnitudes

## Estado del bloque (26/09/2026)

Candidato basado exactamente en `main` 10.0.6 (`2a7bf4c574bf7eeb4bf6aa4e93b72e0d4d79a71e`). Este bloque no toca motores financieros, fuente bancaria, persistencia, Supabase, OCR ni lógica de conciliación.

## Hallazgo

El control «Ocultar importes» sustituía las cantidades monetarias por una máscara, pero el gráfico de cash flow seguía conservando alturas proporcionales a los importes reales. Por tanto, una persona que mirase la pantalla podía seguir deduciendo visualmente qué meses tenían ingresos o gastos mucho mayores aunque las cifras estuvieran ocultas.

## Corrección candidata

- `FinancialBarChart` detecta el estado de privacidad a través del mismo formateador monetario que ya recibe de Inicio: si el formateador no distingue entre 0 y 1 céntimo, las magnitudes se consideran ocultas.
- En ese estado, las barras usan una altura neutra común del 36%, de modo que no codifican magnitudes reales.
- El texto auxiliar informa «Importes ocultos · proporciones protegidas».
- El nombre accesible del gráfico y los botones mensuales dejan de describir ingresos/gastos/neto y pasan a indicar que los importes están ocultos.
- Al volver a mostrar importes, el gráfico recupera las proporciones reales.
- El estado sigue persistiendo mediante el mecanismo existente de Inicio; no se añade ninguna persistencia nueva.

## Regresión añadida

`tests/e2e/inicio-privacy-visual.spec.ts` valida que:

1. con importes visibles existen alturas diferentes;
2. al ocultarlos todas las barras pasan a 36%;
3. los nombres accesibles no exponen cantidades;
4. la protección persiste tras recargar;
5. al volver a mostrar importes se restauran las proporciones.

## Gate

No se considera 10.0.7 validada ni se incrementa la versión hasta que el gate de Inicio (build + Playwright desktop/móvil) pase sobre el commit exacto de esta rama. Vercel Production de 10.0.6 continúa siendo un gate independiente y no bloquea este trabajo local/CI.