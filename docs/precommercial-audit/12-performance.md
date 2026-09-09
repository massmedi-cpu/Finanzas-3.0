# 12 · Auditoría de rendimiento

## Dictamen

El runtime 10.0.0 actual no muestra una inestabilidad general: el deployment Production auditado no registra errores de runtime en las últimas 24 horas y el build compila rápido. Sin embargo, la arquitectura de lectura realiza más saltos de red de los necesarios y no existe todavía telemetría de Core Web Vitals que permita declarar LCP/INP/CLS comerciales con evidencia.

## Evidencia positiva

- Deployment actual: sin errores de runtime en la ventana de 24 h comprobada.
- Build Production: compilación optimizada ~1,45 s, TypeScript ~0,79 s, build total ~9 s antes del deploy.
- No existe librería pesada de charts en cliente; las visualizaciones actuales son DOM/CSS.
- OCR pesado (`tesseract.js`, `pdfjs-dist`) sólo se importa desde rutas/servicios server-side y no forma parte deliberada de la UI cliente.
- Tesseract reutiliza worker y serializa trabajo para limitar memoria/concurrencia accidental.
- Gateway comprime payloads >64 KiB y verifica en postbuild que plain/gzip/health funcionan.
- SQL financiero central se ejecuta dentro de PostgreSQL, evitando reconstruir miles de movimientos en React.

## Hallazgos

### PERF-001 — P1/P2 · Inicio hace una consulta financiera redundante

**Área:** API / carga inicial  
**Evidencia:** `dashboard-client.tsx` solicita en paralelo `financial.snapshot` y `financial.monthly`. El motor `financial.snapshot` ya devuelve `period`, `balances`, `monthly` y `principles`, como demuestra la función SQL/gateway y el consumidor de Cuentas.  
**Consecuencia:** Inicio realiza 5 peticiones cuando una de ellas puede eliminarse sin perder información, generando otra invocación Next → OIDC → Edge Function → PostgreSQL.  
**Recomendación:** ampliar el tipo de snapshot de Dashboard para consumir `financial.monthly` incluido y eliminar `/api/financial?mode=monthly` de Inicio.  
**Esfuerzo:** Muy bajo.  
**Riesgo de regresión:** Bajo con E2E del gráfico anual.  
**Prioridad:** P1 quick win / P2 sistémico.  
**Criterio de aceptación:** Inicio construye exactamente la misma serie mensual con una petición menos y mismos importes.

### PERF-002 — P1 UX/P2 técnico · El recurso más lento bloquea todo Inicio

**Área:** Perceived performance / resiliencia  
**Evidencia:** Dashboard usa un único `Promise.all` para financial, monthly, budgets, forecast y transactions. Mientras cualquiera esté pendiente se mantiene la pantalla de carga completa; si una sola falla, se descarta el resto y se muestra error global.  
**Consecuencia:** presupuesto o previsión lentos impiden ver saldo/balance aunque estos ya estén disponibles. La latencia percibida equivale al endpoint más lento.  
**Recomendación:** composición progresiva o endpoint agregador. Priorizar bloque crítico (saldo + balance), renderizarlo primero y cargar secundarios con skeletons independientes. Si se crea agregador, debe componer motores existentes, no duplicar cálculos.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Medio visual, bajo financiero.  
**Prioridad:** P1 percepción premium / P2 técnico.  
**Criterio de aceptación:** fallo/lentitud de Presupuesto o Previsión no impide ver saldo y balance ya disponibles.

### PERF-003 — P2 · Cada lectura financiera cruza varias fronteras de red

**Área:** Backend / latencia  
**Evidencia:** una petición de UI llega a Next API; `callPersistenceGateway()` obtiene identidad OIDC, llama Edge Function Supabase y ésta crea un cliente PostgreSQL `max:1`. Inicio provoca varias cadenas equivalentes en paralelo.  
**Consecuencia:** seguridad y aislamiento son buenos, pero el coste fijo de red/identidad/conexión se multiplica por widget.  
**Recomendación:** diseñar `dashboard.snapshot` server-side que, en una sola invocación autenticada, componga `financial_snapshot`, `budget_snapshot`, `forecast_snapshot` y transacciones recientes usando motores centrales existentes. No crear SQL paralelo ni lógica duplicada. Medir antes/después.  
**Esfuerzo:** Medio/alto.  
**Riesgo de regresión:** Medio.  
**Prioridad:** P2.  
**Criterio de aceptación:** una carga de Inicio reduce invocaciones gateway/DB manteniendo idénticos hashes/resultados por submotor.

### PERF-004 — P2 · Política `no-store` absoluta impide reutilización segura incluso dentro de una sesión

**Área:** Cache / navegación  
**Evidencia:** APIs y clientes principales usan `cache: "no-store"`; al navegar y volver se repiten lecturas aunque no haya mutación intermedia.  
**Consecuencia:** frescura máxima a costa de repetir trabajo. En la instancia personal es aceptable, pero a escala comercial eleva latencia/coste.  
**Recomendación:** no cachear ciegamente datos financieros. Introducir deduplicación in-flight y caché cliente corta/invalidation-driven para snapshots inmutables por parámetros, invalidada tras sync/edición/presupuesto/reconciliación. Mantener la fuente bancaria y operaciones de escritura fuera de caché.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Medio si la invalidación es incorrecta.  
**Prioridad:** P2 después de PERF-001/002.  
**Criterio de aceptación:** navegación repetida evita trabajo duplicado sin mostrar una versión anterior después de una mutación confirmada.

### PERF-005 — P2 comercial · OCR está serializado por instancia

**Área:** Concurrencia / escalabilidad  
**Evidencia:** `TesseractImageOcrProvider` mantiene un único workerPromise y una `queueTail`; cada reconocimiento espera al anterior y la cola expira tras 8 s. Esta estrategia protege memoria en la instancia personal.  
**Consecuencia:** con varios clientes simultáneos, solicitudes OCR legítimas competirían por un único worker y empezarían a fallar por `ocr_queue_timeout`.  
**Recomendación:** conservar la serialización local como guardrail, pero para comercialización mover OCR pesado a cola/job workers con concurrencia limitada, aislamiento por job y estado persistente. No volver a ejecución ilimitada en la función web.  
**Esfuerzo:** Alto.  
**Riesgo de regresión:** Alto si se cambia el pipeline sin fixtures; bajo para la UI si se encapsula.  
**Prioridad:** P2 comercial / P3 personal.  
**Criterio de aceptación:** varias cargas simultáneas no provocan OOM ni timeout por esperar a un único proceso, y el resultado OCR sigue siendo determinista.

### PERF-006 — P2 · Ingesta procesa observaciones secuencialmente una a una

**Área:** Sync / PostgreSQL  
**Evidencia:** `source.sync_batch` permite hasta 10.000 observaciones y ejecuta `financial_app.ingest_source_observation(...)` dentro de un `for` secuencial por observación. El dataset actual contiene 3.172 filas.  
**Consecuencia:** garantiza control fino y atomicidad, pero el tiempo crece casi linealmente con el histórico y cada fila añade roundtrip interno driver/DB dentro de la misma transacción.  
**Recomendación:** sólo tras medir: función batch SQL/JSONB o staging temporal que valide y aplique N observaciones en set-based SQL conservando fingerprints, revisiones, duplicados, atomicidad y rollback. No optimizar a costa del Axioma.  
**Esfuerzo:** Alto.  
**Riesgo de regresión:** Alto.  
**Prioridad:** P2 si métricas demuestran cuello; de momento no tocar como quick win.  
**Criterio de aceptación:** mismo resultado exacto por fixture/hashes con mejora de tiempo demostrada y rollback total ante una fila inválida.

### PERF-007 — P2 · No existe RUM/Core Web Vitals versionado

**Área:** Medición  
**Evidencia:** no se ha encontrado `useReportWebVitals` ni integración `speed-insights` en el repositorio. El prompt exige TTFB/LCP/CLS/INP, pero actualmente no existe una serie real de usuario que permita establecer baseline comercial.  
**Consecuencia:** cualquier afirmación de “rendimiento adecuado” sería incompleta; build rápido no equivale a UX rápida.  
**Recomendación:** instrumentación de Web Vitals respetuosa con privacidad y dashboard por ruta/dispositivo; registrar p50/p75/p95 y budget de regresión.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2 antes de QA comercial.  
**Criterio de aceptación:** LCP, INP y CLS p75 medidos en Production/entorno representativo por móvil y escritorio, con umbrales definidos.

### PERF-008 — P3 · Dependencias OCR hacen pesado el artefacto de build

**Área:** Deploy / server bundle  
**Evidencia:** `package.json` incluye Tesseract, datos spa y pdfjs; el build cache Production subido fue ~275,49 MB. Esto no demuestra por sí solo un bundle cliente grande porque OCR es server-only.  
**Consecuencia:** mayor coste de caché/deploy y potencial cold-start/tracing en rutas OCR; no se ha demostrado impacto directo en navegación normal.  
**Recomendación:** medir tamaño de función `/api/documents/ocr` y cold start; sólo si es problema, aislar OCR como worker/servicio. No eliminar datos/modelos necesarios para ahorrar build sin medición.  
**Esfuerzo:** Medio/alto si se aísla.  
**Riesgo de regresión:** Medio.  
**Prioridad:** P3.

## Observación sobre errores históricos

Vercel registra en 7 días un OOM en `/api/archive/reprocess-ocr`, pero pertenece a un deployment/ruta anterior y esa ruta no existe en `main` actual. Se conserva como antecedente para el modelo de concurrencia OCR, pero **no se clasifica como error vigente de Production 10.0.0**.

## Orden de optimización recomendado

1. Eliminar monthly redundante de Inicio.
2. Evitar que un widget secundario bloquee todo Inicio.
3. Medir Web Vitals reales.
4. Decidir si conviene endpoint compuesto de dashboard.
5. Sólo con métricas, optimizar sync/OCR a escala.

## Estado de fase

Rendimiento: **COMPLETADA** para la primera ronda.

Estado comercial: **NO APTA**.
