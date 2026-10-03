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

## Evidencia de certificación y publicación

- candidato de rama certificado: `775ecb17d4ab703c74446acb0d46725a191ef901`;
- certificación previa a PR: GitHub Actions `37141276676`, éxito;
- PR `#530`, CI completo verde y candidatura exacta certificada;
- workflow `Release 10.0.68`: `37141445686`, éxito;
- merge estable en `main`: `eac3b925c17aee0cc4414a815b7c8ecb13ce02d1`;
- `Production Backup v2`: `37141744568`, éxito, con PostgreSQL + Storage, cifrado, validación y restauración aislada en PostgreSQL 17;
- commit de publicación: `58129bed57db03075f84afa8f64e65bdbf797b62`;
- deployment Vercel de producción: `dpl_4S87EEKB55WHB9g45uqfyAcUz2fc`, estado `READY`;
- `/api/build` confirmó `version=10.0.68`, `targetVersion=10.0.68`, rama `main`, commit y deployment exactos, con `releaseDeployable=true`;
- Git deployments cerrados de nuevo tras la publicación;
- `Production Postflight`: `37142108975`, éxito;
- postflight: identidad inmutable, 10 pruebas Playwright de escritorio/móvil, acceso privado y APIs cerradas, PWA, ausencia de desbordamiento horizontal, cabeceras de seguridad y comprobación de datos reales con sesión forzada de solo lectura, todo verde.

## Estado

REL-068: **CERRADA, CERTIFICADA Y PUBLICADA EN PRODUCCIÓN**.
