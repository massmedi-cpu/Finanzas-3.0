# 01 · Auditoría de arquitectura de software

## Dictamen

La arquitectura interna actual de Financial App 10.0.0 es **sólida para una aplicación financiera personal de propietario único**. La separación `domain / application / infrastructure / core / design` es comprensible, la fuente bancaria está protegida de forma append-only/inmutable y la lógica crítica utiliza contratos explícitos en lugar de inferencias.

No se recomienda reescribir esta base. Los principales problemas aparecen al evaluar el producto como **software comercial multiusuario y multientorno**.

## Fortalezas verificadas

1. **Capas explícitas.** `src/domain` contiene modelos, contratos y puertos; `src/application` contiene servicios/casos de uso; `src/infrastructure` contiene auth, Google, OCR y persistencia.
2. **Puertos de dominio.** `src/domain/ports.ts` define repositorios y `FinancialUnitOfWork` sin acoplar el dominio a Supabase.
3. **Fuente bancaria protegida.** El puerto `TransactionSourceRepository` no expone update/delete y la migración base añade triggers que rechazan UPDATE/DELETE sobre `transaction_source_records`.
4. **Dinero en enteros.** La persistencia usa céntimos `bigint` con límites compatibles con enteros seguros de JavaScript; el parser convierte decimales a céntimos y falla ante entradas ambiguas.
5. **Fail closed en ingesta.** Cabeceras, pestañas, productos, orden temporal, fechas, importes y duplicados se validan antes de persistir.
6. **TypeScript estricto.** `strict=true`, `noEmit=true` y no se han encontrado usos de `as any` en la búsqueda inicial.
7. **Sin deuda obvia de marcadores.** No se han encontrado `TODO`, `dangerouslySetInnerHTML` ni `localStorage` en la búsqueda inicial del repositorio.

## Hallazgos

### ARC-001 — P0 comercial · No existe frontera de tenant/propietario en el dominio financiero

**Área:** Dominio / Persistencia / Seguridad / Producto  
**Evidencia:** Consulta de `information_schema.columns` confirma que, entre `user_id`, `owner_id`, `tenant_id`, `profile_id` y `workspace_id`, únicamente existe `financial_app.authorized_users.user_id`. Las tablas financieras son globales para la instancia. Hay 1 usuario autorizado activo.  
**Consecuencia actual:** Ninguna para el uso personal actual; el modelo reduce complejidad y encaja con el propósito de esta instancia.  
**Consecuencia comercial:** Imposibilidad de alojar de forma segura varios clientes dentro del mismo backend sin rediseño de ownership.  
**Solución:** Añadir un agregado raíz de tenant/household/workspace y propagar ownership mediante migraciones incrementales, constraints, índices, RLS/servicios y tests de aislamiento. El dataset personal actual se migrará a un tenant inicial sin cambiar sus IDs ni resultados financieros.  
**Complejidad:** Alta.  
**Riesgo de regresión:** Alto si se ejecuta como big-bang; medio si se hace por capas.  
**Prioridad:** P0 sólo para comercialización multiusuario; no es un defecto del modo personal actual.  
**Criterio de aceptación:** Dos tenants de prueba no pueden leer, enlazar ni modificar datos cruzados; el tenant inicial conserva exactamente 3172 movimientos y 3172 source records.

### ARC-002 — P0 comercial · Contrato bancario codificado para la fuente personal

**Área:** Dominio / Integraciones  
**Archivo:** `src/domain/official-bank-source.ts`  
**Evidencia:** `OFFICIAL_SOURCE_SHEET_TITLES` y `OFFICIAL_SOURCE_ACCOUNT_CONTRACTS` contienen los nombres físicos y productos concretos de la fuente personal Openbank.  
**Consecuencia actual:** Positiva: evita heurísticas y protege la fuente oficial actual.  
**Consecuencia comercial:** Un segundo cliente/banco necesita cambios de código para incorporarse.  
**Solución:** No sustituir este contrato. Convertirlo en adaptador versionado (`personal-openbank-v1`) detrás de un `SourceContract`/`BankSourceProfile`; añadir perfiles configurables y validadores por proveedor.  
**Complejidad:** Media/alta.  
**Riesgo de regresión:** Bajo/medio si el adaptador actual permanece intacto.  
**Prioridad:** P0 comercial.  
**Criterio de aceptación:** La fuente personal produce exactamente los mismos fingerprints/batches antes y después; una segunda fuente fixture puede incorporarse sin editar el motor central.

### ARC-003 — P2 · Configuración de infraestructura distribuida y con fallbacks a Production

**Área:** Infraestructura / Operaciones  
**Archivos:** `src/infrastructure/persistence/vercel-supabase-gateway.ts`, `src/infrastructure/auth/supabase-auth.ts`  
**Evidencia:** URL de Supabase, región, Vercel project/team y fallback de publishable key están definidos directamente en módulos de infraestructura.  
**Consecuencia:** Portabilidad limitada y mayor riesgo de que preview/staging apunte accidentalmente a Production.  
**Solución:** Crear configuración central tipada y validada por entorno. Mantener compatibilidad con la instancia actual durante la migración, pero eliminar el fallback silencioso a Production fuera de Production.  
**Complejidad:** Baja/media.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.  
**Criterio de aceptación:** cada entorno declara explícitamente backend/project/team y el arranque falla de forma segura si falta una variable obligatoria.

### ARC-004 — P1 Release · Production no está ligado al HEAD exacto de `main`

**Área:** Arquitectura de entrega / Release  
**Evidencia:** `main=68b5199…`; Production READY ejecuta `b24c3dca…`; el status Vercel del merge está rojo por cuota de deployments.  
**Consecuencia:** La procedencia del artefacto es comprensible por historial, pero no es suficientemente inequívoca para un release comercial auditable.  
**Solución:** artefacto/release inmutable promovido por digest/SHA, tag de release y gate post-promoción que compare runtime con release manifest.  
**Complejidad:** Media.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P1 antes de una salida real.  
**Criterio de aceptación:** tag, manifest, commit, deployment y `/api/build` apuntan al mismo release verificable.

### ARC-005 — P2 · Estrategia de tests muy orientada a E2E

**Área:** Arquitectura / QA  
**Evidencia:** `package.json` sólo declara `test:e2e`; Playwright usa `tests/e2e`. Existen pruebas SQL separadas, pero no una gate rápida de dominio/servicios.  
**Consecuencia:** La cobertura integral es valiosa, pero los motores financieros y contratos básicos no disponen de una capa rápida y aislada que reduzca el coste de detectar una regresión elemental.  
**Solución:** Añadir tests unitarios/contractuales para `money`, source identity, parser bancario, effective transactions y servicios centrales. Mantener E2E como gate superior.  
**Complejidad:** Media.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.  
**Criterio de aceptación:** cambios de dominio fallan en segundos antes de desplegar Preview.

## Decisiones del arquitecto

- **No reescribir** `SourceSyncService` aunque sea uno de los módulos de aplicación más grandes: su responsabilidad sigue siendo cohesiva (validar/preparar batch + delegar persistencia), y hoy su comportamiento está fuertemente protegido por tests.
- **No eliminar índices** marcados como `unused_index` sin workload suficiente. Algunos son protecciones de consultas futuras o joins de integridad; el coste de borrarlos sin evidencia supera el beneficio actual.
- **No abrir RLS** en `documents` ni `document_transaction_associations` sólo para silenciar el advisor. El acceso se revisará en Seguridad con el modelo de amenazas completo.
- **No tocar** el contrato bancario personal durante esta auditoría hasta disponer de un adaptador de compatibilidad y pruebas de equivalencia.

## Estado de fase

Arquitectura: **COMPLETADA** para la primera ronda de auditoría. Los hallazgos pasan al comité/roadmap; no se ha modificado lógica financiera validada.
