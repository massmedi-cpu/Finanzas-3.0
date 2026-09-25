# 34 · PRE-023 — flujo Recurrentes ↔ Previsión

Fecha: 2026-09-25 (Europe/Madrid)

## Estado

**IMPLEMENTACIÓN COMPLETADA EN LA RAMA DE RECUPERACIÓN. GATE VISUAL DE NAVEGADOR PENDIENTE DE EVIDENCIA.**

Este addendum registra el cierre técnico de UX-004 + PROD-003 sin reescribir la evidencia histórica de la segunda beta. `main` y Production permanecen sin cambios.

## Problema resuelto

Previsión ya enlazaba a Recurrentes y permitía regenerar el calendario, pero ambos pasos estaban desconectados. Tras confirmar un patrón, el usuario debía reconstruir manualmente el periodo, la cuenta y la acción necesaria para comprobar su efecto.

El nuevo recorrido conserva y hace explícito ese contexto:

1. **Previsión → Recurrentes:** el enlace transporta periodo y cuenta ya validados.
2. **Decisión explícita:** Recurrentes no persiste ni regenera nada hasta que el usuario confirma un patrón.
3. **Identidad canónica:** la vuelta utiliza el UUID devuelto por `recurrence.save`, no una identidad inferida en la interfaz.
4. **CTA de impacto:** la confirmación ofrece “Actualizar y ver impacto en Previsión”.
5. **Regeneración trazable:** la llegada ejecuta una única escritura `forecast.refresh`; el GET continúa sin efectos laterales.
6. **Impacto concreto:** Previsión filtra por `recurrenceId`, resume fechas, primera fecha e impacto neto y permite enfocar el primer elemento correspondiente.

## Conservación honesta del contexto

- Se mantiene el horizonte original cuando contiene la próxima fecha.
- Si la siguiente aparición queda fuera, el horizonte se amplía únicamente hasta esa fecha y nunca por encima del límite central de 730 días.
- Si el patrón pertenece a otra cuenta, se abre esa cuenta para no presentar falsamente un impacto vacío.
- Si la regeneración no produce fechas dentro del alcance, la interfaz lo declara; no inventa importes ni resultados.
- Si la regeneración falla, la recurrencia confirmada no se deshace y se ofrece reintento manual.

## Seguridad y repetición

- Fechas, rangos, cuenta y UUID se validan mediante funciones puras compartidas antes de aceptar el contexto.
- Sólo el valor exacto `recurrenceAction=refresh` autoriza la regeneración contextual.
- Tras una regeneración y lectura correctas, el parámetro de acción se elimina con `replaceState`; recargar la URL ya no repite la escritura.
- Un contexto manipulado se descarta y usa el comportamiento seguro de Previsión sin ejecutar la acción.
- La fuente bancaria oficial sigue siendo estrictamente de solo lectura; no hay migración ni tabla nueva.

## Arquitectura

- `forecast-selection.ts` contiene la selección pura, compartible entre servidor y cliente, sin importar el gateway.
- `recurrence-flow.ts` centraliza la construcción y lectura de deep-links.
- `forecast-loader.ts` conserva exclusivamente la carga del snapshot desde persistencia.
- La página de Recurrentes recibe `searchParams` asíncronos conforme a Next.js 16.
- La regeneración contextual se mantiene en el cliente como POST explícito y el impacto se deriva del contrato existente de `ForecastItem`.

## Evidencia ejecutada

- `npm run typecheck`: **SUCCESS**.
- `npm run build`: **SUCCESS**, incluida compilación de `/forecast` y `/recurrences` con Next.js 16.3.4.
- Contratos de navegación y PRE-023: **7 passed, 0 failed**.
- Contratos relacionados de API y gateway: **5 passed, 0 failed**.
- `git diff --check`: sin errores de whitespace.

Las pruebas ejecutadas verifican ida/vuelta reversible, rango máximo, cambio de cuenta, UUID canónico, rechazo de parámetros manipulados y ausencia de regeneración ante un token de acción inexacto. Los recorridos E2E de ambas pantallas están preparados para verificar además la CTA posterior a confirmar y que Previsión regenere una sola vez, quite el token de la URL, muestre el impacto y traslade el foco al detalle correspondiente.

## Gate que no se declara superado

El entorno continúa sin el binario Chromium requerido por Playwright. En este mismo entorno, el verificador alternativo `agent-browser` tampoco pudo iniciar su daemon después de los dos intentos permitidos. Por tanto, las dos pruebas E2E de interfaz quedan preparadas y tipadas, pero no se declara evidencia visual, de hidratación o interacción real.

El cierre visual total de PRE-023 requiere ejecutar los recorridos nuevos en desktop y móvil cuando haya navegador disponible. No se ha creado otro despliegue de Vercel para suplir esta carencia ni se han consumido créditos de publicación.
