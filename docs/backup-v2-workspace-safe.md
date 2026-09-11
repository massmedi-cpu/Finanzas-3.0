# Financial App · Backup v2 compatible con workspaces

Estado: **preparado en paralelo al backup F13 v1; no sustituye al v1 hasta superar CI y restore rehearsal completos**.

## Objetivo

El backup v2 elimina supuestos fijos del backup F13 original y prepara una copia portable tanto para el estado actual de Production como para el estado posterior a PRE-001/PRE-020/CR-001.

## Cambios de seguridad

- La versión de aplicación se lee de `package.json`.
- `schema_version` se consulta en la base real.
- El número de buckets y objetos de Supabase Storage se descubre en el momento de crear la copia.
- Se genera `storage-inventory.json` con metadatos de buckets y objetos.
- Si Storage contiene objetos, la copia falla cerrada salvo que se aporte un archivo de Storage verificable.
- No se restaura automáticamente `authorized_users`, `google_oauth_connections`, `workspace_memberships`, `workspace_deletion_intents` ni `workspace_deletion_runtime_policy`.
- Tras un restore, el usuario/allowlist, membership, OAuth/Vault y secretos deben reaprovisionarse expresamente.
- La política de ejecución de borrado nunca se recupera desde el backup: cualquier futura activación debe volver a aprobarse.
- Los recibos históricos de borrado sí pueden conservarse como evidencia de auditoría; no activan ejecución.

## Compatibilidad

El manifest v2 incluye flags de capacidades para distinguir una copia anterior a workspaces de otra posterior. El validador exige las tablas de tenancy/deletion sólo cuando la base de origen realmente declara esas capacidades.

## Validación obligatoria antes de usarlo en Production

1. Pruebas unitarias/contrato del creador y validador.
2. Restore rehearsal completo sobre PostgreSQL desechable con todas las migraciones actuales.
3. Confirmar que datos financieros y UUID se conservan sin huérfanos.
4. Confirmar que membership/allowlist/OAuth/intents/política destructiva quedan vacíos tras restore.
5. Reaprovisionar un usuario sintético de forma separada y comprobar que el acceso puede recuperarse sin reactivar borrado.
6. Regresión E2E completa del SHA exacto.
7. Sólo después puede sustituir al backup F13 v1 en el corte de Production.

## Evidencia local previa a CI

Se verificaron dos escenarios sintéticos del creador/validador v2: pre-workspace y post-workspace. También se comprobó que falla ante `data.sql` manipulado, ante datos de `workspace_deletion_runtime_policy`, y ante Storage con objetos sin archivo; con archivo de Storage presente y hash válido, el paquete se acepta.
