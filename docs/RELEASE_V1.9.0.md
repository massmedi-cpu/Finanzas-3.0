# Finanzas 3.0 — V1.9.0

## Alcance

- División reversible de un movimiento entre 2 y 12 categorías/subcategorías.
- La suma de las partes debe coincidir con el importe original con tolerancia de un céntimo.
- La fuente bancaria original nunca se modifica.
- Las divisiones se guardan en la capa privada y quedan auditadas.
- Presupuestos e informes consumen las divisiones para repartir correctamente el gasto.
- Eliminar una división restaura el análisis del movimiento principal sin pérdida del original.

## Validación

La versión debe superar typecheck, build de producción y preview antes de fusionarse en `main`.
