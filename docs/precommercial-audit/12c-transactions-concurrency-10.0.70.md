# REL-070 · Movimientos: concurrencia y saneamiento de gates · 10.0.70

## Objetivo

Cerrar la deuda PRE-016 de carreras entre cargas de reemplazo y paginación, y eliminar falsos rojos causados por workflows de releases históricas que se ejecutaban contra cualquier PR futuro.

## Problema confirmado

Movimientos ya disponía de una secuencia global para ignorar respuestas obsoletas, pero reemplazo y append compartían el mismo contador. El diseño permitía acoplar dos ciclos distintos y dejaba un caso peligroso: una paginación iniciada sobre el cursor anterior podía coincidir con un reemplazo de filtros.

Además, los workflows `Release 10.0.66`, `Release 10.0.67` y `Release 10.0.68` estaban suscritos a cualquier `pull_request` hacia `main`. Sus verificadores son específicos de versión, por lo que podían marcar como fallida una release posterior aunque su código fuera correcto.

## Cambio funcional

- secuencia independiente para cargas de reemplazo;
- secuencia independiente para paginación append;
- `AbortController` independiente para ambos ciclos;
- un reemplazo nuevo aborta cualquier replace anterior y cualquier append obsoleto;
- una respuesta abortada o supersedida no puede mutar filas, contadores, cursor ni estado de error;
- append queda bloqueado mientras existe un reemplazo activo;
- desmontaje/inicialización invalida y aborta ambos ciclos;
- no se modifica la API bancaria, fórmulas financieras ni persistencia.

## Protección automática

`tests/e2e/transactions-concurrency-10.0.70.spec.ts` cubre dos órdenes deliberadamente adversos:

1. filtro A lento seguido por filtro B rápido: B debe permanecer visible aunque A termine después;
2. paginación lenta seguida por filtro nuevo: la página antigua nunca puede anexarse al resultado nuevo.

`scripts/verify-transactions-concurrency-10.0.70.mjs` exige el contrato de secuencias/controladores y comprueba que 10.0.66–10.0.68 ya no estén conectadas a todos los PR futuros.

## Saneamiento CI

Los workflows históricos 10.0.66, 10.0.67 y 10.0.68 conservan:

- ejecución en su rama histórica específica;
- `workflow_dispatch` manual.

Se elimina únicamente su trigger genérico `pull_request -> main`. Sus regresiones relevantes siguen incluidas en las certificaciones actuales.

## Invariantes

- fuente bancaria oficial: solo lectura;
- sin cambios de esquema ni datos;
- sin cambios en cálculos financieros;
- paginación por cursor conservada;
- edición individual, masiva, revisión de duplicados y transferencias quedan fuera de la lógica modificada y se cubren con la regresión completa de Movimientos.
