# 09a · Cierre móvil y responsive · Financial App 10.0.65

## Objetivo

Revalidar MOB-001…MOB-008 contra el producto acumulado posterior a 10.0.64 y cerrar únicamente la deuda que seguía viva. REL-065 no reimplementa navegación, gráficas, breakpoints ni safe-area ya certificados por releases anteriores.

## Revalidación

| Hallazgo | Estado antes de REL-065 | Cierre |
| --- | --- | --- |
| MOB-001 · targets táctiles | PARCIAL | CERRADO: controles ordinarios conservan 44x44; visualizaciones densas mantienen >=44px de alto y declaran explícitamente su excepción de ancho para no provocar overflow. |
| MOB-002 · navegación móvil app-like | CERRADO previamente | REL-059 convirtió AppShell en infraestructura raíz; el dock móvil persistente permite cambiar de área sin volver a Inicio. |
| MOB-003 · microtexto pequeño | PARCIAL | CERRADO: metadata, estados y ayuda decisional móvil reciben un mínimo tipográfico transversal. |
| MOB-004 · falta 430px | CERRADO previamente | La matriz contiene 360, 430, 479/481 y otros cruces; REL-065 conserva además 480 en su gate específico. |
| MOB-005 · Fuente fuera de matriz | ABIERTO | CERRADO: `/configuration/source` entra en la matriz principal y en barrido 360/430/480. |
| MOB-006 · gráficas de escritorio | CERRADO previamente | Los componentes financieros actuales admiten tap/foco, lectura exacta y alternativas accesibles/tabulares; VIZ-001/VIZ-004 quedaron revalidados en 10.0.64. |
| MOB-007 · teclado/viewport bajo | ABIERTO | CERRADO: gate 390x568 con foco real y comprobación de oclusión por el dock fijo. |
| MOB-008 · safe-area | CERRADO previamente | AppShell aplica `env(safe-area-inset-bottom)` al contenido y navegación móvil fija. |

## Cambios REL-065

### Touch y legibilidad móvil

`app/touch-targets.css` establece un contrato transversal <=480px:

- todo botón/`role=button` operativo mantiene al menos 44px de alto;
- controles ordinarios mantienen además 44px de ancho;
- las visualizaciones financieras densas pueden repartir el ancho entre puntos contiguos mediante `data-dense-target="true"`, sin perder la altura táctil ni la lectura exacta por foco/tap;
- inputs/selects/textarea operativos: mínimo 44px de alto y 16px de texto;
- `small`, metadata, estados y labels de resumen decisional: no caen por debajo de `--font-helper`.

La excepción densa se introdujo después de que el gate global UX detectara correctamente un overflow de 15px en el cash flow de Inicio causado por aplicar 44px de ancho a cada uno de sus 12 meses. La corrección eliminó la regresión sin desactivar el contrato táctil general.

### Fuente en matriz responsive

`/configuration/source` se incorpora a la matriz principal y se prueba explícitamente a 360, 430 y 480px sin overflow horizontal y con navegación móvil táctil.

### Viewport bajo y foco

`tests/e2e/mobile-quality-10.0.65.spec.ts` usa 390x568 para aproximar el espacio útil reducido por teclado/viewport dinámico. En Previsión enfoca un campo real, lo desplaza a vista y verifica que no queda oculto bajo el dock fijo.

### Guard permanente

`scripts/verify-mobile-quality-10.0.65.mjs` bloquea regresiones del contrato táctil, la excepción densa explícita, mínimo tipográfico móvil, cobertura de Fuente, 360/430/480, viewport bajo/foco, safe-area y navegación móvil persistente. Está integrado en `postbuild` y en `npm run verify:mobile-quality`.

## Certificación del candidato

Candidato final: `b0da1cdc592d466c310ba787572cd8a6659ac86d`.

- Release 10.0.65 · run `37113123893`: SUCCESS.
- UX 15 User Value · run `37113124019`: SUCCESS, incluida la regresión del cash flow de Inicio.
- PRE-039 Axioma 120-145 · run `37113123953`: SUCCESS.
- El resto de gates globales del mismo SHA (OCR, integridad DB, Source Trust, Responsive Matrix, Release Identity, Axioma 62-71, Action Feedback y cleanup) quedaron verdes.

## Producción

- PR `#526` integrado en `main`.
- Commit funcional estable: `a1704b51632048419499c8d7cb57b38db92cbca4`.
- Production Backup v2 · run `37113585319`: SUCCESS con restauración real en PostgreSQL 17 aislado y Storage recuperado/verificado.
- Deployment: `dpl_7Q8Jj7bAivsfNCyMuJ2S1hQcsEMj`.
- Commit de publicación: `f8d212adb813785f78bff00cc3f8246c040614c7`.
- Production Postflight · run `37113793843`: SUCCESS 4/4.
- `/api/build`: `version=10.0.65`, `targetVersion=10.0.65`, `branch=main`, `environment=production`, `releaseDeployable=true`.

## Restricciones conservadas

- No se modifica cálculo financiero, persistencia, OCR ni reglas contables.
- La fuente bancaria oficial continúa en solo lectura.
- No se introduce una librería UI ni una dependencia nueva.
- Los cambios son acumulativos sobre AppShell, visualización y sistema de diseño ya certificados.

## Estado

REL-065 / Financial App 10.0.65: **CERTIFICADA, RESPALDADA, PUBLICADA Y VERIFICADA EN PRODUCCIÓN**.
