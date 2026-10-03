# 09a · Cierre móvil y responsive · Financial App 10.0.65

## Objetivo

Revalidar MOB-001…MOB-008 contra el producto acumulado posterior a 10.0.64 y cerrar únicamente la deuda que sigue viva. REL-065 no reimplementa navegación, gráficas, breakpoints ni safe-area ya certificados por releases anteriores.

## Revalidación

| Hallazgo | Estado antes de REL-065 | Evidencia actual |
| --- | --- | --- |
| MOB-001 · targets táctiles | PARCIAL | Previsión ya elevó controles a 44px de alto, pero faltaba un contrato móvil transversal y una gate 44x44 explícita. |
| MOB-002 · navegación móvil app-like | CERRADO previamente | REL-059 convirtió AppShell en infraestructura raíz; el dock móvil persistente permite cambiar de área sin volver a Inicio. |
| MOB-003 · microtexto pequeño | PARCIAL | REL-054 fijó `--font-helper: 0.8125rem` en superficies prioritarias, pero dejó expresamente pendiente el resto de CSS Modules. |
| MOB-004 · falta 430px | CERRADO previamente | La matriz actual contiene 360, 430, 479/481 y otros cruces; REL-065 conserva además 480 en su gate específico. |
| MOB-005 · Fuente fuera de matriz | ABIERTO | `/configuration/source` no figuraba en `tabletRouteSweep` ni tenía barrido móvil específico 360/430/480. |
| MOB-006 · gráficas de escritorio | CERRADO previamente | Los componentes financieros actuales admiten tap/foco, lectura exacta y alternativas accesibles/tabulares; VIZ-001/VIZ-004 quedaron revalidados en 10.0.64. |
| MOB-007 · teclado/viewport bajo | ABIERTO | No existía una prueba con altura móvil reducida, foco real y comprobación de oclusión por el dock fijo. |
| MOB-008 · safe-area | CERRADO previamente | AppShell aplica `env(safe-area-inset-bottom)` al contenido y navegación móvil fija. |

## Cambios REL-065

### Touch y legibilidad móvil

`app/touch-targets.css` pasa de proteger sólo el enlace Inicio a establecer un contrato transversal <=480px:

- botones y elementos `role=button` del contenido: mínimo 44x44 CSS px;
- inputs/selects/textarea operativos: mínimo 44px de alto y 16px de texto para evitar zoom/legibilidad pobre;
- `small`, metadata, estados y labels de resumen decisional: no pueden caer por debajo de `--font-helper` (13px).

No se obliga a que texto decorativo puro o kickers sean mayores si no comunican estado, dato o acción.

### Fuente en matriz responsive

`/configuration/source` se incorpora a la matriz principal y además se prueba explícitamente a 360, 430 y 480px sin overflow horizontal y con navegación móvil táctil.

### Viewport bajo y foco

`tests/e2e/mobile-quality-10.0.65.spec.ts` usa 390x568 para aproximar el espacio útil reducido por teclado/viewport dinámico. En Previsión enfoca un campo real, lo desplaza a vista y verifica que no queda oculto bajo el dock fijo.

### Guard permanente

`scripts/verify-mobile-quality-10.0.65.mjs` bloquea regresiones del contrato 44px, mínimo tipográfico móvil, cobertura de Fuente, 360/430/480, viewport bajo/foco, safe-area y navegación móvil persistente. Se integra en `postbuild` y como `npm run verify:mobile-quality`.

## Restricciones conservadas

- No se modifica cálculo financiero, persistencia, OCR ni reglas contables.
- La fuente bancaria oficial continúa en solo lectura.
- No se introduce una librería UI ni una dependencia nueva.
- Los cambios son acumulativos sobre AppShell, visualización y sistema de diseño ya certificados.

## Estado

Candidato REL-065: **PENDIENTE DE CERTIFICACIÓN CI**.

El cierre exige guard estático, TypeScript, build, matriz responsive y gate móvil 10.0.65 verdes sobre el mismo SHA exacto antes de versionar, respaldar y publicar.
