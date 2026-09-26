# Financial App 10.0.7 · Inicio y privacidad visual de magnitudes

## Estado del bloque (26/09/2026)

Candidato basado exactamente en `main` 10.0.6 (`2a7bf4c574bf7eeb4bf6aa4e93b72e0d4d79a71e`). Este bloque no toca motores financieros, fuente bancaria, persistencia, Supabase, OCR ni lógica de conciliación.

La versión candidata ya está sincronizada como **10.0.7** en `package.json` y `package-lock.json` mediante `npm version 10.0.7 --no-git-tag-version`; el workflow temporal usado para hacerlo se eliminó en el mismo commit. El gate permanente de Inicio incorpora además `release-version-contract.spec.ts`, de modo que no se acepta una futura divergencia entre versión visible, lockfile, metadata y `/api/build`.

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

## Evidencia previa al cierre exacto

- `7115aeaddcd4846a405eca70f2927286aff59bac`: build + auditoría Inicio desktop/móvil SUCCESS con la regresión de privacidad incluida.
- `dce07946f517a405766d3f016f5904be1d0cb1f9`: auditoría ampliada SUCCESS incluyendo resumen inteligente, explicaciones de cifras y consistencia regional.
- `37ee0bc54a1e625cd7690ca97a74de6284befe50`: versionado 10.0.7 sincronizado por npm; GitHub no relanzó los workflows porque ese push fue generado por `github-actions[bot]` con `GITHUB_TOKEN`.

## Gate final

El commit que incorpora este documento y el contrato de versión al workflow es el candidato exacto que debe superar de nuevo build + Playwright desktop/móvil. El job protegido de Vercel no se fuerza mientras exista `build-rate-limit`. 10.0.7 permanecerá guardada en rama/PR y **no se fusionará a `main` antes de cerrar Production 10.0.6**, para impedir que el siguiente deployment salte directamente desde la Production real 10.0.5 a 10.0.7.
