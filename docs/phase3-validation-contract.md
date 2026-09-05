# Fase 3 — Contrato de validación

La Fase 3 no se considerará cerrada por existencia de código o configuración. Deben quedar demostrados los siguientes gates acumulativos:

1. Comercios y alias: normalización, equivalencias, categoría por defecto y lifecycle validados en PostgreSQL, Edge, Vercel y preview protegido, sin residuos sintéticos.
2. Motor de reglas: prioridad determinista, condiciones por concepto/cuenta/importe/comercio y objetivos de categoría/comercio, sin lógica duplicada ni escritura sobre la fuente bancaria.
3. Persistencia y trazabilidad: las decisiones automáticas deben ser reproducibles y los cambios manuales deben prevalecer mediante overrides, nunca reescribiendo registros fuente.
4. Regresión acumulativa: Fases 1 y 2 permanecen verdes, incluida la fuente bancaria read-only, el dataset persistido de 3.172 movimientos y la sincronización idempotente ya validada.
5. Responsive y accesibilidad: cualquier superficie de gestión añadida en Fase 3 debe respetar los contratos base ya validados.

Solo tras superar estos gates se actualizará Fase 3 a 100%, se fusionará a `main` y se iniciará Fase 4.
