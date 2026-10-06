# AUD-005 · Axioma §26 · buscador de Movimientos · tramo 2

Fecha: 2026-10-06  
Release candidata: Financial App 10.0.85  
Base: Financial App 10.0.84

## Gap comprobado

Tras publicar 10.0.84, el §26 seguía sin filtros explícitos para varios datos que sí existen en el modelo real.

La inspección de `transaction_source_records.source_payload` confirmó presencia real en todas las filas actuales de:

- `Canal`;
- `Comercio o contraparte`;
- `Conciliado`;
- `Subcategoría`.

Además, el modelo persistente dispone de asociaciones de documentos, previsiones confirmadas con `recurrence_id`, transferencias emparejadas y etiquetas de reparto.

## Implementación 10.0.85

El motor `query_effective_transactions_v3` añade filtros combinables por:

- canal;
- contraparte;
- conciliación;
- recurrente confirmado;
- transferencia interna;
- movimiento con documento asociado;
- texto de metadatos del documento asociado;
- etiqueta de reparto.

La interfaz añade también accesos directos de año y mes; la API los transforma en un intervalo de fechas coherente e intersecta ese periodo con cualquier rango de fechas introducido.

Las facetas de Canal, Conciliación y Año se derivan de datos persistidos reales; no se codifican valores financieros ficticios.

La trazabilidad visible del movimiento incorpora canal, contraparte, conciliación y subcategoría de origen.

## Evidencia de base de datos

La migración se aplicó de forma reproducible.

Comprobaciones reales:

- Canal: filtro positivo sobre datos existentes y todas las filas devueltas coinciden.
- Conciliación: filtro positivo sobre datos existentes y todas las filas devueltas coinciden.
- Transferencia interna: 64 coincidencias reales y todas cumplen emparejamiento o canal interno.
- Contraparte: prueba por substring sobre un valor existente, correcta.
- Faceta Año: 9 años reales detectados, 2018–2026.
- `anon` y `authenticated`: sin EXECUTE directo sobre v3.
- `financial_app_gateway`: EXECUTE autorizado.

Actualmente no hay movimientos reales con asociación documental confirmada ni previsión recurrente confirmada; esas rutas se mantienen en el contrato y no se fabrican datos para simular cumplimiento en Producción.

## Guardrails

- No se modifica `transaction_source_records`.
- Fuente bancaria y Google Drive/Sheets financieros: solo lectura.
- v1 y v2 se conservan; v3 es aditiva.
- Los valores de facetas se leen del modelo persistido.
- Gate permanente 10.0.85 dentro de `postbuild`.

## Alcance pendiente del §26

Tras este tramo quedan dos huecos principales que no se declaran cerrados:

1. etiquetas generales de movimiento (distintas de la etiqueta de reparto);
2. búsqueda sobre evidencia OCR cruda/no confirmada.

No se consideran cumplidos hasta que exista un modelo real y verificable.
