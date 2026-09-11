# CR-007 · Medición operativa real

## Estado

**En curso.** Esta fase queda preparada técnicamente cuando la instrumentación llegue a Production, pero no puede declararse completada hasta disponer de observaciones reales de uso autenticado. No se fabrican sesiones, percentiles, tasas de error ni Web Vitals.

## Objetivo

Obtener evidencia operativa real de Financial App sin introducir un proveedor analítico adicional ni ampliar innecesariamente la superficie de datos personales.

La señal se divide en dos fuentes:

1. **RUM de navegador first-party** para Core Web Vitals y errores JavaScript no capturados.
2. **Observabilidad de plataforma ya existente en Vercel** para errores y respuestas del runtime/servidor.

Las dos fuentes deben analizarse por despliegue y ventana temporal. Los fallos deliberados de CI, smoke o contratos de validación no se contabilizan como incidencias reales de usuario.

## Privacidad por diseño

El cliente sólo puede enviar dos esquemas cerrados.

### Web Vital

- `type = web_vital`
- `route`: ruta normalizada de una allowlist; cualquier otra ruta se convierte en `/other`.
- `name`: `CLS`, `FCP`, `FID`, `INP`, `LCP` o `TTFB`.
- `value`: valor numérico finito.
- `rating`: valor de la allowlist o `null`.

### Error cliente

- `type = client_error`
- `route`: ruta normalizada.
- `kind`: `window_error` o `unhandled_rejection`.
- `errorName`: nombre genérico seguro, por ejemplo `TypeError`; si el cliente no puede obtener un nombre seguro envía `UnknownError`.

El contrato rechaza campos adicionales. En particular, no se aceptan ni se registran mensaje, stack trace, URL completa, query string, cookies, identificadores de usuario, sesión, cuentas, movimientos, comercios, importes, documentos u otro contenido financiero.

La infraestructura de Vercel puede conservar metadatos técnicos propios de una petición conforme a la configuración de la plataforma; CR-007 no añade identificadores funcionales propios a ese tráfico.

## Frontera de entorno

- **Production:** los payloads válidos se convierten en eventos estructurados `financial-app-rum` o `financial-app-client-error`.
- **Preview / CI / desarrollo:** el endpoint valida exactamente el mismo contrato pero responde `204` sin emitir eventos RUM reales.
- El endpoint no forma parte de `PUBLIC_PATHS`; en Production queda bajo la autenticación existente de la aplicación.

Esto evita mezclar pruebas automatizadas, previews o tráfico anónimo con la muestra operativa real.

## Presupuestos de rendimiento

| Métrica | Presupuesto |
| --- | ---: |
| CLS | ≤ 0,10 |
| FCP | ≤ 1.800 ms |
| FID | ≤ 100 ms |
| INP | ≤ 200 ms |
| LCP | ≤ 2.500 ms |
| TTFB | ≤ 800 ms |

FID se conserva sólo como compatibilidad. La decisión de capacidad de respuesta se apoya en INP.

## Registro estructurado

Cada evento de Production incluye únicamente:

- `contractVersion`
- `appVersion`
- `deploymentSha`
- `route`
- para Web Vitals: `metric`, `value`, `rating`, `budget`, `withinBudget`
- para error cliente: `kind`, `errorName`

No se registra el cuerpo bruto recibido.

## Evidencia necesaria para cerrar CR-007

La mera existencia de instrumentación no completa esta fase. Para cambiar el estado a **Completada** debe existir una ventana de Production posterior al despliegue de CR-007 con uso autenticado real y evidencia verificable de:

1. eventos RUM reales asociados al SHA de Production;
2. cobertura de las superficies críticas usadas realmente durante la ventana;
3. valores de Core Web Vitals comparables con los presupuestos anteriores;
4. revisión de `financial-app-client-error` y de errores runtime/5xx de Production;
5. separación documentada entre incidencias reales y pruebas deliberadas;
6. cualquier desviación relevante corregida o aceptada explícitamente con evidencia.

No se exige inventar un volumen mínimo de usuarios: Financial App es actualmente un producto privado monousuario. Sí se exige que los datos observados procedan de uso real y no de simulación etiquetada como real.

## Línea base previa

Antes de CR-007 no existían `useReportWebVitals`, Web Analytics, Speed Insights, Sentry ni un pipeline RUM propio en el repositorio. Los grupos de error visibles en Vercel durante la auditoría incluían entradas como `invalid_mode`, `invalid_dateFrom` e `invalid_financial_date_range` sobre despliegues anteriores, generadas por pruebas de validación; por tanto no son una línea base fiable de incidencias humanas.

## Regla fail-closed

Si no hay muestra real suficiente para afirmar comportamiento operativo, el estado permanece **En curso**. Ausencia de datos no equivale a rendimiento correcto.
