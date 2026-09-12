# CR-006 · Entorno de beta humana sin coste

Estado: **PREPARACIÓN TÉCNICA — NO ES EVIDENCIA HUMANA**.

Este entorno existe únicamente para habilitar la beta humana real de CR-006 sin crear infraestructura facturable ni exponer datos de Production.

## Condiciones de activación

El modo beta solo se carga cuando coinciden las dos condiciones siguientes:

- `VERCEL_ENV=preview`.
- `VERCEL_GIT_COMMIT_REF=commercial-readiness/cr006-zero-cost-beta`.

La ruta `/beta` devuelve 404 fuera de ese Preview exacto. Production no carga el runtime de beta.

## Modelo de aislamiento

- Dataset 100 % ficticio.
- La fuente bancaria se representa como `read_only`.
- Las escrituras del tester se guardan únicamente en `localStorage` del navegador.
- Las rutas same-origin `/api/*` se interceptan en el navegador durante la sesión beta.
- Una ruta `/api/*` no implementada falla cerrada con `cr006_beta_endpoint_not_implemented`; nunca cae al backend real.
- Las llamadas directas a hosts `*.supabase.co`, `*.googleapis.com` y `*.googleusercontent.com` se bloquean durante la sesión beta con `cr006_beta_external_persistence_blocked`.
- La carga de documentos usa una URL local sintética; no escribe en Storage real.
- No se crean ramas Supabase, proyectos ni otros recursos facturables.

## Cobertura funcional preparada

El runtime ficticio cubre Inicio, Primeros pasos, Para revisar, Movimientos, Análisis, Cuentas, Categorías, Presupuestos, Recurrentes, Previsión, Documentos/OCR, Configuración, Fuente, Comercios y Reglas.

Incluye varios meses, dos cuentas, ingresos, gastos, transferencias internas, una compra repetida legítima marcada para revisión, movimientos pendientes, categorías, comercios, presupuestos, candidatos recurrentes, previsiones y documentos ficticios.

## Persistencia y reinicio

La sesión se activa mediante `/beta` y su cookie dura como máximo 23 horas. `/beta?reset=1` reinicia el dataset local del navegador antes de entrar.

## Evidencia y cierre

Este entorno, sus pruebas automáticas, un Preview READY o cualquier validación técnica derivada de él **no cuentan como beta humana**. B01–B08, H01–H08 y A01–A06 continúan PENDIENTES hasta ser ejecutados por personas reales y documentados en la matriz CR-006.

CR-008 permanece bloqueado hasta el cierre formal de CR-006 conforme al Prompt Maestro.
