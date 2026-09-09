# 03 · Auditoría backend y base de datos

## Dictamen

La persistencia 10.0.0 presenta un nivel de integridad alto para la instancia personal actual. La cadena de migraciones está aplicada, las constraints están validadas, la ingesta se ejecuta de forma atómica y la fotografía viva no muestra huérfanos ni duplicados técnicos.

El principal bloqueo precomercial no es la consistencia del dato actual, sino la **separación de entornos y de propietarios**.

## Evidencia viva

- PostgreSQL 17.6.1.166 · proyecto `financial-app` ACTIVE_HEALTHY.
- 45 migraciones registradas en `supabase_migrations.schema_migrations`, desde `financial_app_foundations` hasta `optimize_authorized_users_rls_initplan`.
- Constraints no validadas: 0.
- 3172 `transaction_source_records` y 3172 `transactions`.
- Source records sin transaction: 0.
- Transactions sin source record: 0.
- Fingerprints fuente duplicados: 0.
- Identidades físicas duplicadas por file/sheet/row: 0.
- Parejas de transferencia asimétricas: 0.
- Account source mappings huérfanos: 0.
- Overrides: 0; sync issues: 0.

## Fortalezas verificadas

1. **Ingesta atómica.** `source.sync_batch` usa `sql.begin`; un fallo revierte el batch y registra un run fallido fuera de la transacción revertida.
2. **Idempotencia.** Existe replay estable por revisión/fingerprint y el test sintético Preview comprueba insert→skip dentro de una transacción que se fuerza a rollback.
3. **Inmutabilidad de origen.** La capa fuente no expone UPDATE/DELETE y la BD contiene protección por trigger.
4. **Concurrencia protegida.** La ingesta estable usa advisory lock por `sourceFileId`; migraciones previas endurecen merge de categorías y consistencia de transferencias.
5. **SQL parametrizado.** El gateway usa tagged templates de `postgres`, evitando concatenar datos de usuario en SQL.
6. **Search path endurecido.** Las funciones auditadas tienen `proconfig` con `search_path` vacío o explícito; las funciones SECURITY DEFINER observadas no dependen del search path del llamador.
7. **Esquema privado.** Las tablas financieras no están concedidas directamente a `anon`/`authenticated`; el acceso normal pasa por el gateway server-only.

## Hallazgos

### BE-001 — P1 · Preview y Production comparten frontera de persistencia

**Área:** Entornos / CI-CD / integridad  
**Evidencia:** `financial-app-db-gateway/index.ts` acepta OIDC de `preview` y `production` mediante `ALLOWED_ENVIRONMENTS`. Ambos llegan al mismo Edge Function del proyecto Supabase `financial-app`, que toma una única `SUPABASE_DB_URL`. Las acciones normales (`account.save`, `category.save`, motores financieros, etc.) no están restringidas a Production o a un datastore de Preview.  
**Matiz importante:** los health checks sintéticos observados están bien diseñados: `test.source_ingestion` sólo funciona en Preview y fuerza rollback completo; el estado vivo no contiene sus fixtures. Esto reduce el riesgo de los tests actuales, pero no separa los entornos.  
**Consecuencia:** un Preview funcional puede, por diseño, invocar mutaciones normales contra la misma base que Production. Un fallo de test, una feature incompleta o una prueba manual podría afectar datos reales.  
**Recomendación:** separar persistencia de Preview/Staging y Production. Como mínimo: proyecto/base de datos distinta para previews mutables o gateway que rechace acciones de negocio mutables cuando el identity environment sea `preview`, salvo namespace de fixtures transaccionales.  
**Esfuerzo:** Medio/alto.  
**Riesgo de regresión:** Medio.  
**Prioridad:** P1 antes de una salida comercial real.  
**Criterio de aceptación:** ninguna petición originada por un deployment Preview puede cambiar filas de Production; los E2E mutables se ejecutan contra un entorno desechable/aislado.

### BE-002 — P0 comercial · Persistencia sin ownership multiusuario

**Área:** Modelo de datos / autorización  
**Evidencia:** las tablas financieras no tienen `user_id`/`tenant_id`/`owner_id`; sólo `authorized_users.user_id` vincula identidad.  
**Consecuencia:** correcto para una instancia privada de propietario único, bloqueante para SaaS multiusuario.  
**Recomendación:** misma estrategia incremental descrita en ARC-001; no duplicar una segunda solución.  
**Esfuerzo:** Alto.  
**Riesgo de regresión:** Alto.  
**Prioridad:** P0 comercial.

### BE-003 — P2 comercial · La seguridad de datos depende principalmente del gateway, no de RLS por dominio

**Área:** Autorización / defensa en profundidad  
**Evidencia:** de las tablas de `financial_app`, RLS sólo está activado en `authorized_users`, `google_source_policy`, `documents` y `document_transaction_associations`. Las tablas financieras principales no usan RLS porque `anon`/`authenticated` no tienen grants y el gateway dispone del acceso de servidor.  
**Consecuencia actual:** arquitectura privada coherente y cerrada; no se ha detectado acceso directo público.  
**Consecuencia comercial:** al introducir múltiples usuarios, una equivocación en el gateway tendría un radio de impacto mayor porque la BD no conoce ownership de fila.  
**Recomendación:** tras introducir tenancy, aplicar defensa en profundidad en BD (ownership + RLS o rol por tenant/servicio) sin abrir el esquema al cliente.  
**Esfuerzo:** Alto, dependiente de BE-002.  
**Riesgo de regresión:** Medio/alto.  
**Prioridad:** P2 actual; sube a P0 junto con comercialización multiusuario.

### BE-004 — P2 · Identidad de infraestructura codificada en gateway

**Área:** Operaciones / portabilidad  
**Evidencia:** `TEAM_SLUG`, `TEAM_ID`, `PROJECT_NAME`, `PROJECT_ID` y audiencia Vercel están definidos en código; esto replica el acoplamiento observado en el cliente server-side del gateway.  
**Consecuencia:** crear staging, fork empresarial o migrar de proyecto exige cambio y despliegue de código en vez de configuración validada.  
**Recomendación:** configuración tipada por entorno, validada al arranque; mantener defaults sólo donde no puedan apuntar silenciosamente a Production.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.

### BE-005 — P3 · Tipado débil dentro del Edge gateway

**Área:** TypeScript / mantenibilidad  
**Evidencia:** helpers centrales de gateway aceptan `any` (`accountPayload`, `categoryPayload`, handlers de source sync y `sql: any`). Existe validación runtime extensa, por lo que no es un fallo de seguridad por sí solo.  
**Consecuencia:** reduce ayuda estática al evolucionar contratos y facilita drift entre módulos del gateway.  
**Recomendación:** tipar progresivamente payloads/SQL client por acción empezando por contratos de fuente y transacciones; conservar toda la validación runtime.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P3.

## Decisiones

- No se eliminarán índices marcados como `unused_index` sólo por el advisor: el dataset/workload actual no demuestra que sean inútiles.
- No se activará RLS indiscriminadamente sobre todas las tablas mientras la instancia siga siendo single-owner y server-only; la política debe diseñarse junto con tenancy.
- No se sustituirá el mecanismo de rollback por migraciones down destructivas. El proyecto ya dispone de backup/restauración certificado y puede evolucionar con migraciones forward-only + restore controlado.

## Estado de fase

Backend/BD: **COMPLETADA** para la primera ronda de auditoría. El siguiente bloque es Seguridad.
