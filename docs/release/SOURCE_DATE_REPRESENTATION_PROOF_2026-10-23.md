# AP5 — prueba estricta de la representación de Fecha

Lecturas de conectores y ejecución local el **23/10/2026 a las 21:12:52 UTC**. Base de código: `af9c97c2a7310ca47c905e8dcc9f46ec44148901` + REC-SYNC-387–394. **Diagnóstico de solo lectura; AP5 sigue abierto y publicación NO-GO.**

## Evidencia real

Se volvieron a leer las dos pestañas completas, sus 22 cabeceras y los originales de Supabase, mediante una única consulta SQL `BEGIN READ ONLY` acotada al archivo oficial y al workspace existente. La consulta comprobó 3.188 identidades únicas y cero revisiones. Las lecturas de Google y DB son secuenciales y no atómicas; no acreditan frescura futura ni una operación sincronizada.

| Resultado | Filas |
| --- | ---: |
| Fuente autoritativa Google | 3.208 |
| Originales persistidos | 3.188 |
| Payload, hash y campos financieros exactos | 3.187 |
| Solo Fecha española guardada → serial entero Google, mismo día | 1 |
| Otros cambios históricos | 0 |
| Pendientes de incorporar | 20 |
| Huérfanos | 0 |
| Saldos originales desconocidos, conservados como null | 134 |

Se comprobaron **70.136 celdas originales (3.188 × 22)**. No se publican filas, conceptos, IDs, fingerprints ni payloads privados. Las entradas privadas permanecen fuera del repositorio y de CI. La entrada local antes y después de la función conserva el mismo digest. No hubo escrituras en Google ni en Supabase.

## Contrato probado

`src/application/source-date-representation-audit.ts` reconstruye cada observación mediante el parser oficial. Recalcula el hash de las 22 celdas originales y verifica además identidad, concepto original, cuenta, día, importe y saldo persistidos. La forma privada del diagnóstico exige once campos exactos y las 22 claves de payload, sin aceptar columnas omitidas o añadidas. No cambia el contrato público de ocho columnas de `source.postflight_rows`.

Para clasificar una diferencia como representacional exige **todos** estos hechos:

1. Mismos archivo, pestaña e ID de fila; sin duplicados ni originales huérfanos.
2. Fecha original exactamente `DD/MM/YYYY` válida; Fecha actual serial numérico entero entre 1 y 100.000. Únicamente esa dirección, sin formatos aproximados, timestamps ni fracciones.
3. Ambos valores parsean al mismo día UTC y concuerdan con los campos financieros independientes.
4. Las otras 21 celdas del payload del contrato oficial coinciden con su tipo exacto. Solo se aplica la normalización de celdas vacías propia del parser oficial de ingesta; no se añaden normalizaciones de texto o dinero.
5. Cada fingerprint concuerda con su propio payload completo y sus metadatos. Un hash arbitrario nunca obtiene la clasificación.

La función devuelve exclusivamente contadores y clasificación. No devuelve un lote de escritura, no reescribe ni elimina originales, no hace revisiones y no modifica la política de sincronización.

## Regresiones y límite operativo

REC-SYNC-387–394: **28 pruebas locales PASS**, incluyendo una mutación por cada una de las otras 21 columnas, tipos distintos, espacios, null frente a cero, fechas inválidas/diferentes, formato inverso, hashes y metadatos falsificados, límites, duplicados, huérfanos y privacidad de errores. La suite está seleccionada por la matriz integrada y por Source Trust CI; el guard exige que siga ejecutándose.

La prueba con los datos reales: **1/1 PASS**. La simulación 3.208/3.188 confirma que el conciliador productivo estricto sigue `blocked`, con una diferencia de hash y 20 pendientes. `isSafeAppendOnlySourceBaseline` sigue siendo falso. Este diagnóstico NO certifica una sincronización completada y NO admite un hash cambiado de forma genérica.

Para cerrar AP5 faltan: contrato de gateway compatible y probado, tratamiento de esta representación dentro de una operación exclusivamente de altas que conserve el original, respaldo cifrado fresco con restauración/rollback, preflight nuevo ligado a la revisión, importación controlada de las 20 altas y postflight independiente. No se desplegó gateway ni se aplicaron migraciones como parte de esta prueba.
