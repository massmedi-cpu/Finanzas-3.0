# REL-069 · Inicio: ruta crítica progresiva · 10.0.69

## Objetivo
Reducir el tiempo percibido hasta la información financiera principal sin cambiar cálculos, persistencia ni la fuente bancaria oficial de solo lectura.

## Cambio
- `critical`: solicita únicamente `financial.snapshot`.
- `activity`: solicita `transaction.query` de forma independiente.
- `secondary`: mantiene histórico, presupuestos y previsión.
- `primary` se conserva en la API por compatibilidad hacia atrás.
- Inicio libera su estado de carga principal cuando termina `critical`; actividad y secundarios mantienen ciclos propios.
- Un fallo o demora de actividad ya no impide mostrar saldo y balance mensual.

## Protección automática
- Verificador estático `verify-home-progressive-loading-10.0.69.mjs`.
- E2E `inicio-progressive-loading-10.0.69.spec.ts` retrasa actividad y exige saldo visible antes.
- Se conserva el diagnóstico de reflow 200%/400% de REL-069.

## Invariantes
- Sin cambios en fórmulas financieras.
- Sin escritura en la fuente bancaria oficial.
- Sin cambio del gateway de persistencia.
- `scope=primary` preservado para consumidores existentes.
