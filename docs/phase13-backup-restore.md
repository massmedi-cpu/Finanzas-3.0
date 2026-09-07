# F13 · Backup, restauración y publicación 10.0.0

## Objetivo

Cerrar Financial App con un respaldo portable, verificable y sin secretos; demostrar que el estado puede restaurarse sin poner en riesgo la base productiva; ejecutar regresión completa; y publicar 10.0.0 únicamente cuando Producción sirva el SHA exacto validado.

## Fuentes de verdad

- El archivo bancario oficial de Google Drive sigue siendo **solo lectura** y continúa siendo la fuente bancaria autoritativa.
- PostgreSQL/Supabase conserva el estado operativo y las decisiones de la aplicación. El backup debe preservar sus identificadores internos porque overrides, revisiones, previsiones y asociaciones pueden referenciar transacciones concretas.
- El código, migraciones, tests y Edge Functions quedan versionados en Git y deben restaurarse desde el **SHA exacto** indicado en `manifest.json`.
- Los secretos no forman parte del backup portable. Se vuelven a aprovisionar después del restore.

## Por qué existe este backup

Financial App usa actualmente Supabase Free. Según la documentación vigente de Supabase, los proyectos Free no disponen de los backups diarios automáticos de Pro/Team/Enterprise; Supabase recomienda exportar regularmente con `supabase db dump` y guardar copias fuera del proyecto.

## Contenido obligatorio

El paquete contiene:

1. `schema.sql`: esquema `financial_app` completo, incluidas funciones, constraints, RLS y objetos versionados por PostgreSQL que exporte Supabase CLI.
2. `data.sql`: datos del esquema `financial_app`, incluidos `transaction_source_records` y `transactions` para conservar referencias internas.
3. `manifest.json`: SHA Git exacto, versión de esquema, política bancaria, locale, hashes SHA-256 y estado de Supabase Storage.
4. Archivo independiente de Supabase Storage **sólo cuando haya objetos**. Un dump de base de datos no contiene los bytes de Storage.

El backup de datos excluye deliberadamente:

- `financial_app.google_oauth_connections`: la autorización Google/Vault se vuelve a aprovisionar.
- `financial_app.authorized_users`: el allowlist de acceso se vuelve a aprovisionar tras el restore.
- Tokens, contraseñas, service-role keys, Vercel tokens y cualquier secreto de entorno.

## Crear el backup

Requisitos: Supabase CLI, acceso a una URL de conexión de base de datos y un directorio seguro fuera del repositorio.

Variables obligatorias:

```text
FINANCIAL_APP_DB_URL=<conexión privada, nunca guardar en Git>
FINANCIAL_APP_SOURCE_COMMIT=<SHA Git exacto de 40 caracteres>
FINANCIAL_APP_SCHEMA_VERSION=<schema_version de financial_app.schema_meta>
FINANCIAL_APP_STORAGE_BUCKET_COUNT=<número actual de buckets>
FINANCIAL_APP_STORAGE_OBJECT_COUNT=<número actual de objetos>
```

Si `FINANCIAL_APP_STORAGE_OBJECT_COUNT` es mayor que cero, además:

```text
FINANCIAL_APP_STORAGE_ARCHIVE=<ruta a un archivo off-site que contenga los objetos>
```

Crear y validar:

```bash
npm run backup:create -- <directorio-seguro>
npm run backup:validate -- <directorio-seguro>
```

El generador usa `supabase db dump` con `--schema financial_app`, `--use-copy` para los datos y exclusión explícita del contenido de tablas sensibles. El validador falla cerrado si cambian hashes, faltan tablas críticas, desaparecen transacciones/source records, se cuelan filas de tablas sensibles, la política bancaria no es `read_only` o Storage tiene objetos sin archivo independiente.

## Baseline comprobado al iniciar F13

- `financial_app.schema_meta.schema_version = 14`
- `bank_source_policy = read_only`
- `locale = es-ES`, `currency = EUR`, `time_zone = Europe/Madrid`
- 3.172 `transactions`
- 3.172 `transaction_source_records`
- 3 `accounts`
- 3 `account_source_mappings`
- 1 `categories`
- 3 `sync_runs`
- 2 `sync_cursors`
- 1 documento sintético de prueba, sin `total_cents` y sin asociación
- 1 bucket de Supabase Storage y **0 objetos**
- 0 filas en `google_oauth_connections`

Estas cifras son un checkpoint de F13, no límites rígidos: el validador final debe aceptar crecimiento legítimo y bloquear pérdidas o incoherencias.

## Prueba de restauración

Nunca se borra ni se reinserta la base productiva sólo para demostrar un restore.

La prueba final debe ejecutarse sobre un destino vacío y desechable —proyecto/branch Supabase de prueba o PostgreSQL compatible— y debe:

1. Validar primero el paquete con `npm run backup:validate`.
2. Restaurar `schema.sql` y `data.sql` en una transacción que falle ante el primer error.
3. Comprobar las filas clave y la integridad referencial.
4. Reaprovisionar el usuario autorizado y Google/Vault; no copiar secretos desde el backup.
5. Restaurar los objetos de Storage por separado si `objectCount > 0` y recrear la configuración del bucket.
6. Desplegar las Edge Functions desde el SHA Git exacto del manifest.
7. Ejecutar Advisors, health checks y la regresión E2E completa.
8. Confirmar que la fuente bancaria continúa declarada como `read_only`.

Un proyecto/branch Supabase adicional puede tener coste. No debe crearse automáticamente sin la confirmación de coste exigida por la plataforma.

## Publicación final

El orden de cierre es obligatorio:

1. Integración y limpieza verdes.
2. Backup final creado, validado y copiado fuera de Supabase.
3. Restauración demostrada en destino desechable.
4. Checkpoint `[vercel-preview]` del SHA final.
5. Preview exacto READY + regresión protegida completa.
6. Advisors/baseline sin deriva.
7. Merge a `main`.
8. Producción debe servir el **SHA exacto del merge final** en `/api/build`.
9. Runtime de Producción sin errores/fatales y rutas privadas/auth verificadas.
10. Sólo entonces `APP_VERSION` y el cierre documental pueden afirmar 10.0.0 completada.

### Vercel build-rate-limit

Durante el cierre de F12, Vercel rechazó el build de `main` con `Deployment rate limited — retry in 24 hours`. Esto es un bloqueo externo de publicación, no un fallo funcional del dashboard. Vercel documenta que un deployment READY puede promocionarse a Producción sin rebuild mediante:

```bash
vercel promote <deployment-url> --yes
```

La promoción sólo debe hacerse sobre el **Preview final de F13**, nunca sobre un Preview anterior si ya existe un SHA F13 más nuevo. Después hay que repetir toda la verificación de Producción; una promoción no equivale por sí sola a cierre exitoso.

## Copia off-site en Google Drive

El paquete final debe guardarse bajo Financial App en una carpeta específica de copias de seguridad, con fecha y SHA en el nombre. Nunca se suben credenciales, `.env`, passwords ni tokens. El Gantt debe registrar el nombre/ID de la copia final y el resultado del restore, no secretos ni contenido financiero detallado.
