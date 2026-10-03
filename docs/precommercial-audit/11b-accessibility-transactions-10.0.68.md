# 11b · REL-068 — Accesibilidad operativa en Movimientos · 10.0.68

## Objetivo

Cerrar una parte concreta y verificable de PRE-013 sin reabrir problemas de accesibilidad ya resueltos en la aplicación.

## Hallazgos actuales corregidos

1. La tabla principal de Movimientos mostraba cabeceras visuales, pero sus `th` no declaraban `scope="col"`.
2. El error al guardar una categoría que exige subcategoría se mostraba visualmente, pero no quedaba relacionado mediante `aria-describedby` con el `select` inválido y el foco no se trasladaba al control que debía corregirse.
3. Al abrir la edición de un movimiento, el formulario aparecía sin trasladar el foco al campo principal de concepto.
4. El verificador heredado de REL-067 estaba acoplado literalmente a `10.0.67`; al formar parte de `postbuild`, impedía construir cualquier release posterior. Se mantiene el contrato de REL-067 pero se acepta `10.0.67` o una versión posterior.

## Implementación

- siete cabeceras de la tabla principal declaran `scope="col"`;
- el editor traslada el foco al concepto al abrirse;
- el selector de subcategoría tiene una referencia de foco explícita;
- cuando falta una subcategoría obligatoria, el selector recibe foco;
- el selector expone `aria-invalid` y `aria-describedby` hacia un error con id estable y `role="alert"`;
- no se crea estado financiero alternativo ni se modifica el contrato de persistencia;
- no se altera la fuente bancaria oficial ni sus reglas de solo lectura.

## Gates de aceptación

REL-068 sólo puede integrarse si pasan conjuntamente:

1. verificador estático `scripts/verify-accessibility-transactions-10.0.68.mjs`;
2. TypeScript;
3. build de producción y todos sus `postbuild` heredados;
4. Playwright específico `tests/e2e/accessibility-transactions-10.0.68.spec.ts`;
5. E2E completo existente de `tests/e2e/transactions.spec.ts`;
6. continuidad UX 10.0.66;
7. matriz responsive existente.

## Estado

REL-068: **EN CERTIFICACIÓN**.
