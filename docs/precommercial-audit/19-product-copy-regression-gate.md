# Gate permanente de copy comercial

## Motivo

La auditoría detectó residuos de lenguaje de desarrollo que habían escapado del cierre inicial del Bloque A.

El checkpoint test-first `d13c8686a7864d343a575d167fdc3145af2f0e9d` añadió `tests/e2e/product-copy-gate.spec.ts` y reprodujo exactamente cuatro violaciones visibles:

- `/transactions`: `FASE 4`.
- `/documents`: `FASE 11`.
- `/configuration/source`: `FASE 2`.
- `/configuration/source`: navegación `← Fundamentos`.

## Corrección

El checkpoint funcional `db1084e1e130ab543f3ce02987a0c3d9a6876a0c` sustituyó únicamente ese copy visible:

- Movimientos: `FINANCIAL APP · MOVIMIENTOS`.
- Documentos: `FINANCIAL APP · DOCUMENTOS`.
- Fuente bancaria: `FINANCIAL APP · FUENTE BANCARIA`.
- Navegación de Fuente: `← Configuración` hacia `/configuration`.

No se modificaron motores financieros, APIs, persistencia, OCR, sincronización bancaria ni contratos de datos.

## Gate permanente

`tests/e2e/product-copy-gate.spec.ts` recorre las superficies principales y falla si vuelve a aparecer `FASE N` o `← Fundamentos` en la interfaz de producto.

Este documento forma parte de la evidencia de la auditoría precomercial y no cambia el comportamiento de la aplicación.
