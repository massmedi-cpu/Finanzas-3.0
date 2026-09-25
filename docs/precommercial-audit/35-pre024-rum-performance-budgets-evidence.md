# 35 · PRE-024 — RUM Web Vitals y budgets de rendimiento

Fecha: 2026-09-25 (Europe/Madrid)

## Estado

**INFRAESTRUCTURA Y GATE IMPLEMENTADOS EN LA RAMA DE RECUPERACIÓN. BASELINE PRODUCTION PENDIENTE DE MUESTRA REAL.**

Este addendum completa la capa técnica que faltaba en PERF-007. No declara que Production cumpla todavía los umbrales: `main` y Production no se han modificado, no se ha desplegado este bloque y no existe aún la muestra real mínima por ruta y dispositivo.

## Punto de partida recuperado

La rama ya contenía una captura first-party con `useReportWebVitals`, endpoint autenticado y budgets absolutos. Esa base era privada y no contaminaba Production desde Preview, CI o desarrollo, pero cada muestra quedaba aislada en logs y carecía de clase de dispositivo. No existían percentiles, cobertura mínima ni una salida operativa capaz de fallar ante una regresión.

## Contrato implementado

La política versionada `web-vitals-policy.json` define una única fuente para:

- contrato de log RUM v2;
- ventana móvil de 28 días;
- mínimo de 30 muestras por corte;
- dispositivos `mobile` y `desktop`;
- métricas de gate LCP, INP y CLS;
- rutas principales requeridas;
- budgets p75: LCP ≤ 2.500 ms, INP ≤ 200 ms y CLS ≤ 0,1.

FCP, FID y TTFB continúan capturándose como diagnóstico, pero el gate comercial usa los tres Core Web Vitals actuales definidos en la política.

## Privacidad y coste

Cada muestra contiene únicamente versión de contrato/app, SHA del despliegue, fecha, ruta normalizada, clase gruesa de dispositivo, nombre de métrica, valor, rating y budget. No se envían:

- query strings ni URL completa;
- ancho exacto, modelo, user-agent o fingerprint;
- identidad, cuenta, movimiento, documento o importe;
- cookie, almacenamiento local, mensaje o stack de error;
- identificador de sesión o de la métrica.

La clase de dispositivo se obtiene con una media query local de 767 px y sólo produce `mobile` o `desktop`. La solución reutiliza el endpoint y los logs de Vercel existentes; no instala Speed Insights, drains ni servicios de pago.

## Informe y gate reproducible

El comando versionado es:

```bash
npm run performance:report -- runtime.ndjson --version=10.0.2 --deployment=<sha>
```

Acepta NDJSON de Runtime Logs, eventos Vercel con campo `text` y el formato legado, aunque este último se rechaza para el gate porque no contiene dispositivo. Produce una tabla por ruta/dispositivo/métrica con `n`, p50, p75, p95, budget y estado. Las cohortes separan también el SHA del despliegue: si varios commits comparten el mismo semver, el informe elige el despliegue más reciente o permite fijarlo con `--deployment=SHA`.

Los percentiles usan interpolación lineal sobre la muestra ordenada. El proceso devuelve:

- código `0` sólo cuando todos los cortes seleccionados tienen muestra suficiente y p75 dentro de budget;
- código `1` cuando existe al menos una regresión p75 demostrada;
- código `2` cuando falta muestra, evitando un falso verde;
- código `64` ante argumentos o entrada operativa inválidos.

`--allow-insufficient` permite generar un dashboard parcial sin convertirlo en gate aprobado. También se pueden limitar rutas, dispositivos o métricas para diagnóstico, mientras que la ejecución por defecto exige las ocho rutas financieras principales, dos clases de dispositivo y tres métricas: 48 cortes en total.

## Evidencia sintética ejecutada

- Contrato de endpoint/privacidad y agregador: **6 passed, 0 failed**.
- Se comprueban ingestión estructurada, rechazo del contrato antiguo, aislamiento entre despliegues con el mismo semver, p50/p75/p95 deterministas, estado `pass`, regresión `fail` y muestra `insufficient`.
- `npm run typecheck`: **SUCCESS**.
- `npm run build`: **SUCCESS**, incluida compilación de `/api/telemetry/client` y del reporter cliente con Next.js 16.3.4.
- `git diff --check`: sin errores de whitespace.
- El CLI real responde a `--help` y se ejecuta como proceso Node en las pruebas, no como réplica de su lógica.

Los fixtures sintéticos demuestran el funcionamiento del cálculo y del código de salida; no se presentan como valores reales de rendimiento.

## Gate que no se declara superado

El criterio completo exige LCP, INP y CLS p75 medidos en Production o en un entorno representativo, separados por móvil/escritorio y con muestra suficiente. Eso sólo puede ocurrir después de publicar el contrato v2 y acumular uso real. Hasta entonces, el resultado correcto es **insufficient**, no “rendimiento aprobado”.

No se ha creado un despliegue adicional para forzar datos ni se han consumido créditos de Vercel. Cuando se autorice una publicación futura, el informe deberá ejecutarse sobre la ventana retenida de logs y archivarse como nueva evidencia sin reescribir este estado previo.
