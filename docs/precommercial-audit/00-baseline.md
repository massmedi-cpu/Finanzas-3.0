# Financial App 10.0.0 — Auditoría precomercial

## 00 · Checkpoint de referencia

Fecha de captura: 2026-09-07 (Europe/Madrid)

Este documento inicia la auditoría precomercial sin modificar el estado validado de `main` ni el runtime de Production.

### Código

- Repositorio: `massmedi-cpu/Finanzas-3.0`
- Rama validada: `main`
- HEAD validado de `main`: `68b5199b61b9b9f2d20a052b06705781e891dc10`
- Commit de candidato actualmente ejecutado en Production: `b24c3dca4e1abc0315b7c6d7e7b645870b0a88e9`
- Rama de auditoría aislada: `audit/precommercial-10.0.0`
- Versión de aplicación: `10.0.0`
- Node declarado: `24.x`
- Next.js: `16.3.1`
- React: `19.2.8`
- TypeScript: `7.0.2`
- Playwright: `1.62.1`

### Runtime

- Proyecto Vercel: `prj_SbZ64E02YhCK4ds24Yi7qf5CeQjo`
- Production: `dpl_2WexZbfK8CXU24f21Gcf4T1ba2M8` — READY
- Production fue promovida desde el Preview exacto `dpl_9BiKSxbFVu9XSfxrUxHhipaLQZFu`.
- `/api/build` en Production: HTTP 200, `version=10.0.0`, `targetVersion=10.0.0`, commit `b24c3dca…`.
- Logs `error/fatal` del deployment actual en la ventana comprobada: ninguno.

### Base de datos

- Supabase project: `btzukbfesxdratqnxuoj` (`financial-app`)
- Región: `eu-west-3`
- PostgreSQL: 17.6.1.166
- Estado: `ACTIVE_HEALTHY`
- Cuentas: 3
- Movimientos: 3172
- Registros fuente: 3172
- Overrides: 0
- Sync issues: 0
- Documentos: 1
- Presupuestos: 0
- Recurrentes: 0
- Usuarios autorizados activos: 1

### Seguridad del proyecto Supabase

- WARN conocido: leaked-password protection desactivada; la capacidad depende del plan y no se trata como corrección automática.
- INFO: RLS sin policies en `financial_app.documents` y `financial_app.document_transaction_associations`; se mantiene como parte de la arquitectura privada actual hasta la revisión de seguridad específica.
- Advisor de rendimiento: varios índices aparecen como `unused_index`; no se eliminarán sin evidencia de workload porque su uso cero no demuestra que sobren.

### Backup/restauración ya certificados en F13

La certificación 10.0.0 ya dejó backup final, restauración PostgreSQL 17, regresión E2E y verificación de Production. Esta auditoría toma ese cierre como estado validado de referencia y no lo reescribe.

## Primeros hallazgos precomerciales confirmados

### AUD-0001 — P0 · Modelo de datos de propietario único

**Área:** Arquitectura / Backend / Producto comercial  
**Evidencia:** Las tablas financieras (`accounts`, `transactions`, `budgets`, `documents`, etc.) no contienen `user_id`, `tenant_id`, `owner_id`, `profile_id` ni `workspace_id`. El único `user_id` detectado en el esquema `financial_app` pertenece a `authorized_users`; actualmente existe un único usuario activo.  
**Consecuencia:** El diseño actual es correcto para Financial App personal, pero no puede aislar datos de varios clientes dentro de una comercialización multiusuario.  
**Recomendación:** Diseñar una capa de tenancy/ownership incremental, migrable y compatible con el dataset personal existente antes de cualquier hipotética venta a terceros. No ejecutar una reescritura masiva: introducir propietario raíz, propagar claves/constraints/policies por dominios, migrar datos actuales a un tenant inicial y validar cada bloque.  
**Riesgo de regresión:** Alto si se intenta de una sola vez.  
**Criterio de aceptación:** Dos usuarios/tenants de prueba no pueden leer, inferir, modificar ni enlazar datos entre sí; el usuario personal conserva exactamente sus 3172 movimientos y relaciones.

### AUD-0002 — P0 comercial / P1 técnico · Ingesta oficial ligada a una fuente personal concreta

**Área:** Arquitectura / Producto / Integraciones  
**Evidencia:** `src/domain/official-bank-source.ts` define de forma explícita las pestañas `Cuenta corriente · 3967` y `Cuenta ahorro · 2504`, además de contratos concretos de productos Openbank.  
**Consecuencia:** Es una protección excelente para la fuente oficial personal y evita inferencias, pero impide que un cliente nuevo configure su propia fuente sin modificar código.  
**Recomendación:** Mantener el contrato actual como adaptador `personal-openbank-v1` y añadir una abstracción de `BankSourceProfile`/`SourceContract` configurable y validada. La fuente bancaria personal seguirá siendo estrictamente de solo lectura.  
**Riesgo de regresión:** Alto si se sustituye el contrato actual; bajo/medio si se encapsula y se mantiene como adaptador de compatibilidad.  
**Criterio de aceptación:** El dataset personal produce exactamente el mismo batch y fingerprints que antes; una segunda fuente de prueba puede configurarse sin cambios de código.

### AUD-0003 — P1 · Trazabilidad de release no coincide exactamente con `main`

**Área:** Release / CI-CD / QA  
**Evidencia:** Production READY ejecuta el candidato `b24c3dca…`, mientras que el HEAD actual de `main` es el merge `68b5199…`. El estado Vercel del merge está rojo por límite de despliegues, no por una regresión de código.  
**Consecuencia:** El runtime puede ser funcionalmente equivalente al candidato validado, pero una salida comercial necesita probar de forma inequívoca qué commit/tag exacto está ejecutando Production.  
**Recomendación:** Introducir una gate de procedencia de release: tag inmutable + SHA de artefacto + deployment ID + verificación post-promoción, desacoplada de la cuota accidental de previews.  
**Riesgo de regresión:** Bajo.  
**Criterio de aceptación:** el release comercial referencia un único SHA/tag y Production demuestra ese mismo identificador con gates verdes.

### AUD-0004 — P2 · Acoplamiento de infraestructura a identificadores concretos

**Área:** Arquitectura / Operaciones  
**Evidencia:** `vercel-supabase-gateway.ts` fija URL de Supabase, región, project ID y team ID; `supabase-auth.ts` conserva fallbacks a URL y publishable key del proyecto actual.  
**Consecuencia:** Dificulta separar desarrollo/staging/producción y aumenta el riesgo de apuntar al backend equivocado al crecer el producto.  
**Recomendación:** Centralizar configuración de infraestructura por entorno con validación de arranque y sin fallback a Production fuera de Production.  
**Riesgo de regresión:** Bajo/medio.  
**Criterio de aceptación:** preview/staging/prod resuelven explícitamente su backend y fallan de forma segura ante configuración incompleta.

### AUD-0005 — P2 · Pirámide de pruebas concentrada en E2E

**Área:** QA / Arquitectura  
**Evidencia:** `package.json` expone `test:e2e`; `playwright.config.ts` usa `tests/e2e` como único `testDir`. Existen además pruebas SQL de Supabase, pero no hay una gate explícita de tests unitarios para motores financieros y contratos de dominio.  
**Consecuencia:** Hay buena cobertura integral, pero cambios pequeños en dinero, reglas, fingerprints o cálculos dependen de pruebas más costosas para detectar regresiones.  
**Recomendación:** Añadir una capa rápida de tests de dominio/servicios sin sustituir el E2E actual.  
**Riesgo de regresión:** Bajo.  
**Criterio de aceptación:** lógica financiera central y contratos de fuente tienen tests deterministas rápidos ejecutados antes del E2E.

### AUD-0006 — P2 · Cabeceras de endurecimiento web no definidas en la configuración Next actual

**Área:** Seguridad web  
**Evidencia:** `next.config.ts` se limita al tracing/runtime de OCR; no se han encontrado definiciones de `Content-Security-Policy` ni `Strict-Transport-Security` en el repositorio.  
**Consecuencia:** Parte del endurecimiento puede venir de la plataforma, pero no existe una política de seguridad HTTP de aplicación versionada y verificable.  
**Recomendación:** Auditar primero los headers efectivos de Production y, después, versionar los que falten (CSP compatible con Next/OCR, frame-ancestors, nosniff, referrer/permissions policy, HSTS cuando corresponda).  
**Riesgo de regresión:** Medio si CSP se introduce sin inventario de recursos.  
**Criterio de aceptación:** headers efectivos comprobados en Production y CSP sin romper Next, fuentes, OCR ni OAuth.

## Regla de ejecución

Los hallazgos P0/P1 no autorizan una reescritura destructiva. Se resolverán por capas manteniendo el estado 10.0.0 como referencia y demostrando equivalencia/regresión antes de integrar cada cambio.
