# 36 · PRE-025 — matriz ampliada de edge cases

Fecha: 2026-09-25 (Europe/Madrid)

## Estado

**CONTRATOS, HARDENING Y BENCHMARK LOCAL COMPLETADOS EN LA RAMA DE RECUPERACIÓN. GATES VISUAL Y POSTGRES REAL PREPARADOS, PERO PENDIENTES DE EJECUCIÓN.**

Este addendum cubre EDGE-001/005/006/007/009 sin convertir pruebas estáticas o sintéticas en una aprobación integral. `main` y Production permanecen sin cambios y este bloque no se ha desplegado.

## EDGE-001 · importe exactamente cero

La política queda definida de forma explícita:

- una observación importada con importe cero es válida cuando la fuente aporta también un `transactionKind` explícito;
- el signo no se usa para inventar la clase del movimiento;
- el movimiento cuenta como fila y continúa siendo elegible para analítica salvo exclusión o duplicado confirmado, pero aporta cero al agregado;
- un denominador cero produce ratio `null`, nunca `NaN` o `Infinity`;
- el saldo inicial continúa derivándose de forma determinista desde la secuencia oficial;
- el alta manual de previsión mantiene su contrato distinto y no admite un importe cero.

El contrato puro atraviesa preparación de fuente y motor de análisis. El smoke SQL preparado atraviesa además registro fuente, transacción, facts, consulta, serie mensual y resumen de periodo en una base desechable.

## EDGE-005 · límites máximos de texto

La fixture visual usa los máximos contractuales donde existen. Para cuenta, categoría y comercio —campos de catálogo sin un máximo específico en el contrato actual— usa una frontera adversarial y explícita de 500 caracteres. Todas las cadenas incluyen espacios y deben envolver:

| Campo | Longitud de fixture | Superficie |
|---|---:|---|
| Cuenta | 500 | Movimientos |
| Categoría | 500 | Movimientos |
| Comercio | 500 | Movimientos |
| Concepto | 240 | Movimientos |
| Nota | 2.000 | Movimientos y Documentos |
| Nombre de archivo | 500 | Documentos |
| Emisor | 300 | Documentos |
| Búsqueda | 200 | Movimientos y Documentos |

Los controles editables se alinean con esos límites y la query de movimientos acepta 200 caracteres tanto en API como en gateway. El recorrido de navegador preparado repite Movimientos y Documentos a 360, 430 y 1.440 px y exige simultáneamente ausencia de overflow global, visibilidad de las acciones y conservación del contenido máximo.

## EDGE-006 · 10.000 observaciones y rollback

La preparación de fuente y el gateway comparten ahora un máximo nombrado de 10.000 observaciones. El elemento 10.001 se rechaza antes de persistir con `source_observation_limit_exceeded`.

Budgets reproducibles del benchmark aislado:

| Filas | Tiempo máximo | Heap retenido máximo | RSS retenido máximo | Payload máximo | Gzip máximo |
|---:|---:|---:|---:|---:|---:|
| 1 | 100 ms | 16 MiB | 32 MiB | — | — |
| 3.000 | 3.000 ms | 160 MiB | 192 MiB | 16 MiB | 2 MiB |
| 10.000 | 10.000 ms | 384 MiB | 512 MiB | 16 MiB | 2 MiB |

Última ejecución local registrada:

| Filas | Preparación | Heap retenido | RSS retenido | JSON original | Gzip |
|---:|---:|---:|---:|---:|---:|
| 3.000 | 111,4 ms | 0 MiB | 0 MiB | 3,2 MiB | 0,2 MiB |
| 10.000 | 266,6 ms | 29,6 MiB | 0 MiB | 10,6 MiB | 0,6 MiB |

Estos valores son del preparador síncrono y del encoder ejecutados en el proceso de test. Las cifras de memoria son deltas retenidos, no picos, y no representan latencia de red ni escritura end-to-end en PostgreSQL.

El contrato de rollback inyecta un fallo en la segunda observación dentro de la transacción. Comprueba que no se confirma ninguna sentencia del batch, que se registra una ejecución fallida fuera de la transacción revertida y que se conserva el diagnóstico correspondiente.

## EDGE-007 · sesión expirada con borrador

Movimientos, Documentos y Previsión reconocen `authentication_required` y `authentication_unavailable` durante una mutación. Ante esos fallos:

- los campos permanecen en memoria y sólo se limpian después de una escritura correcta;
- la interfaz declara que el borrador sigue disponible;
- la reautenticación se abre en otra pestaña para no reemplazar el formulario actual;
- el usuario vuelve a la pestaña original y repite la misma acción;
- cambiar o cancelar el elemento editado descarta el aviso obsoleto, no otro borrador.

El recorrido Playwright preparado fuerza un primer 401 y una segunda respuesta correcta en las tres superficies, verificando los valores antes y después del reintento.

## EDGE-009 · workspace completamente vacío

El smoke SQL desechable crea un tenant sin entidades y exige respuestas vacías o cero coherentes para periodo financiero, serie mensual, saldos, presupuesto, recurrentes, previsión, movimientos y documentos. También rechaza cualquier serialización que contenga `NaN` o `Infinity` y finaliza siempre con `ROLLBACK`.

El recorrido de navegador preparado simula el mismo estado en Inicio, Cuentas, Movimientos, Presupuestos, Previsión, Recurrentes y Documentos. Cada ruta debe mostrar un estado vacío útil, sin overflow global ni valores no finitos.

## Evidencia ejecutada

- `npm run test:pre025`: **8 passed, 0 failed**.
- Regresión de productos/orden/runtime de fuente y editor de movimientos: **15 passed, 0 failed**.
- `npm run typecheck`: **SUCCESS**.
- `npm run build`: **SUCCESS** con Next.js 16.3.4.
- `git diff --check`: sin errores de whitespace.

Las ocho pruebas ejecutadas son contratos puros y benchmark local; Playwright no necesitó lanzar Chromium para ellas.

## Gates que no se declaran superados

El recorrido visual `pre025-edge-cases-ui.spec.ts` está implementado y tipado, pero este entorno no dispone del ejecutable Chromium. No se declara por ello evidencia visual real a 360/430/1.440 px ni interacción/hidratación de navegador.

El comando preparado para ejecutarlo cuando exista navegador es `npm run test:pre025:ui`.

El smoke `pre025-zero-empty-db-smoke.sql` requiere una instancia PostgreSQL/Supabase desechable con las migraciones aplicadas. Este entorno no dispone de `psql`, Supabase local ni Docker, por lo que tampoco se declara todavía evidencia end-to-end de base real.

El cierre integral de PRE-025 exige ejecutar ambos gates en un entorno representativo y archivar sus resultados. No se ha creado un despliegue de Vercel para suplir estas carencias ni se han consumido créditos de publicación.
