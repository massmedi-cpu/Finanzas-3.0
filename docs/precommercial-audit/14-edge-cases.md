# 14 · Auditoría de edge cases

## Cobertura real ya existente

La revisión no parte de fixtures mínimos únicamente. El dataset vivo auditado contiene:

- 3.172 movimientos.
- Histórico desde 2018-11-22 hasta 2026-09-02.
- Importe mínimo vivo: -8.500.000 céntimos (-85.000,00 €).
- Importe máximo vivo: 18.086.778 céntimos (180.867,78 €).
- Concepto normalizado de hasta 121 caracteres.
- 1 cuenta archivada.
- 984 movimientos marcados con estado de duplicado distinto de `none`.

Además, la suite existente cubre inputs inválidos, paginación por cursor, selección masiva, transferencias, duplicados, fechas imposibles, OCR de cámara/EXIF/contrato, restore y responsive.

## Casos con protección demostrada

- **Cero resultados de filtros:** estados vacíos explícitos en módulos principales.
- **Un movimiento:** fixtures E2E lo cubren.
- **Miles de movimientos:** dataset vivo + paginación de 50 por cursor.
- **Importes negativos/grandes:** dataset vivo y enteros seguros en API/gateway.
- **Fechas imposibles:** rechazadas antes de persistencia en Financial/Forecast y otras APIs.
- **Cuenta archivada:** existe en vivo y UI tiene tratamiento.
- **Duplicados:** motor/estado/revisión + invariantes sin duplicación técnica de fuente.
- **Transferencia interna:** pairing exige cuentas distintas/importes opuestos/ventana temporal.
- **Servicio auth no disponible:** proxy falla cerrado con 503.
- **Fuente externa cambiante:** read/preflight fail-closed y snapshot mixed-read rechazado.
- **OCR:** tamaño, firma, dimensiones, píxeles, cola y timeouts limitados.
- **Doble clic en varias UI:** `pending/saving/busy` deshabilita acciones en login, sync y mutaciones principales.

## Hallazgos pendientes

### EDGE-001 — P2 · Importe exactamente cero no está demostrado de extremo a extremo

**Evidencia:** el esquema permite `bigint` y los motores usan enteros, pero el dataset vivo tiene 0 movimientos con `amount_cents = 0`; no se ha identificado una fixture explícita de movimiento cero atravesando ingesta → facts → análisis → UI.  
**Riesgo:** clasificación/signo, tasas y visualizaciones pueden tratar cero de manera distinta.  
**Recomendación:** fixture contractual de cero con saldo, tipo permitido y efectos esperados; definir si cero es válido o debe bloquearse en fuente.  
**Criterio de aceptación:** comportamiento de cero documentado y determinista en ingesta, Movimientos, métricas y gráficos.

### EDGE-002 — P1/P2 · Escrituras concurrentes no usan control optimista de versión

**Evidencia:** PATCH de movimientos envía IDs + patch, sin `expectedUpdatedAt`, revision/etag o versión de override. Configuración/presupuesto siguen patrones de escritura similares.  
**Riesgo:** dos pestañas/dispositivos pueden editar el mismo objeto; la última escritura aceptada puede sobrescribir una decisión reciente sin advertencia.  
**Recomendación:** control optimista en entidades editables: `updated_at`/version esperada, respuesta 409 en conflicto y UI de recarga/comparación. Priorizar overrides, presupuestos, reglas y metadatos documentales.  
**Prioridad:** P1 comercial / P2 personal.  
**Criterio de aceptación:** una segunda escritura basada en versión obsoleta no reemplaza silenciosamente la primera.

### EDGE-003 — P2 · Algunos comandos de creación dependen del bloqueo de UI y no de idempotencia server-side

**Evidencia:** `forecast.manual` llama directamente a `save_manual_forecast_item` sin idempotency key de solicitud. La UI deshabilita mientras guarda, pero un retry HTTP/reenvío de red puede repetir el comando.  
**Riesgo:** creación duplicada aunque el usuario haya pulsado una vez.  
**Recomendación:** `requestId/idempotencyKey` para comandos create no naturalmente idempotentes, con unique constraint/registro de comando. No aplicarlo a PATCH idempotentes sin necesidad.  
**Criterio de aceptación:** reenviar exactamente el mismo comando de creación devuelve el mismo resultado sin duplicar entidad.

### EDGE-004 — P1/P2 · Respuestas fuera de orden en Movimientos

**Evidencia:** FE-001; `fetchPage` carece de sequence/abort mientras filtros/clear/recarga pueden solaparse.  
**Riesgo:** tabla no corresponde al filtro visible bajo red lenta/acciones rápidas.  
**Recomendación:** test determinista A-lenta/B-rápida + sequence/abort.  
**Criterio de aceptación:** sólo la solicitud más reciente puede reemplazar el listado.

### EDGE-005 — P2 · Límites máximos de texto no tienen una matriz visual dedicada

**Evidencia:** APIs limitan conceptos a 240, documentos/nombres a 500, notas a 2.000 y queries a 200; el dato vivo llega a 121 caracteres. CSS usa `overflow-wrap` en varias zonas, pero no existe gate sistemática con valores máximos en todos los componentes.  
**Riesgo:** clipping, cards excesivas, botones desplazados o filas de tabla difíciles de usar.  
**Recomendación:** fixture “max-length” en 360/430/1440 para cuenta, categoría, comercio, concepto, documento y nota.  
**Criterio de aceptación:** ningún texto permitido por API rompe layout, oculta una acción o genera overflow global.

### EDGE-006 — P2 · Dataset extremo de 10.000 observaciones no está medido como experiencia completa

**Evidencia:** source batch admite hasta 10.000 observaciones; vivo 3.172. No se ha demostrado tiempo/memoria de ingestión y posterior UX para el máximo contractual.  
**Riesgo:** sync demasiado lento, timeout o costes elevados en un cliente con histórico mayor.  
**Recomendación:** benchmark de 1/3.000/10.000 filas en entorno aislado antes de optimizar el algoritmo.  
**Criterio de aceptación:** límites de tiempo/memoria definidos, con rollback completo ante fallo.

### EDGE-007 — P2 · Sesión expirada durante una edición no tiene prueba de preservación del trabajo

**Evidencia:** proxy refresca sesión de forma segura, pero si refresh falla puede devolver 401/503 a una mutación. Los formularios muestran error, aunque no existe un E2E que expire la sesión con campos editados y compruebe que el contenido local permanece.  
**Riesgo:** usuario pierde una edición larga al reautenticarse/reintentar.  
**Recomendación:** E2E de sesión expirada durante edición de movimiento/documento/previsión; conservar draft no sensible en memoria y ofrecer reintento tras reautenticación.  
**Criterio de aceptación:** fallo de sesión no borra el formulario antes de que el usuario pueda recuperar/reintentar.

### EDGE-008 — P2 · Fallo parcial de un motor secundario derriba Inicio completo

**Evidencia:** Dashboard usa `Promise.all`; un error de presupuesto/previsión/transacciones impide mostrar financial snapshot ya válido.  
**Riesgo:** indisponibilidad parcial se convierte en indisponibilidad percibida total.  
**Recomendación:** PERF-002: render progresivo/fallback por bloque.  
**Criterio de aceptación:** motor secundario caído no elimina el panorama financiero central.

### EDGE-009 — P3 · Estado “base completamente vacía” no está certificado de forma integral

**Evidencia:** hay estados vacíos por módulo, pero la instancia actual siempre contiene datos y no existe una gate que levante una base sin cuentas/movimientos/documentos/presupuestos/recurrentes y recorra toda la app.  
**Riesgo:** onboarding/empty states pueden tener supuestos de dataset existente.  
**Recomendación:** entorno efímero vacío para primera experiencia y snapshot de cada ruta.  
**Criterio de aceptación:** cero entidades produce onboarding/empty states útiles y ningún 5xx/NaN/Infinity.

## Estado de fase

Edge cases: **COMPLETADA** para la primera ronda.

Estado comercial: **NO APTA**.
