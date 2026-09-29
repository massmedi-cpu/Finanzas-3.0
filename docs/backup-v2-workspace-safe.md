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

El gate de 10.0.35 coteja la identidad de cada objeto del archivo de Storage
con el inventario SQL de la misma copia: ID, bucket, nombre, privacidad y tamaño
cuando Storage informa de él. Una coincidencia en el número total de objetos no
basta para aceptar la copia. El postflight de Production toma el commit y el ID
del deployment realmente servido, incluso si `main` recibió después el commit
que vuelve a cerrar los despliegues automáticos.

La recuperación también coteja el número de filas de **cada tabla exportada**
contra los bloques `COPY` del `data.sql` cuyo hash ya se ha validado. Los recuentos
pertenecen así a la propia copia, no a una consulta posterior sobre Production.
Se incluyen las tablas vacías. CI elimina una fila de ajustes en la base sintética
recuperada y exige que la comprobación la rechace. Este control de cardinalidad
complementa los hashes y las comprobaciones de integridad; no compara cada valor.

## Evidencia local previa a CI

Se verificaron dos escenarios sintéticos del creador/validador v2: pre-workspace y post-workspace. También se comprobó que falla ante `data.sql` manipulado, ante datos de `workspace_deletion_runtime_policy`, y ante Storage con objetos sin archivo; con archivo de Storage presente y hash válido, el paquete se acepta.

## Protección del artefacto y desbloqueo de Task 30

El repositorio es público. Los usuarios con acceso de lectura pueden descargar
[artefactos de Actions](https://docs.github.com/actions/managing-workflow-runs/downloading-workflow-artifacts).
Por ello el workflow de producción sube exclusivamente un paquete `.tgz.gpg`
cifrado mediante GnuPG AES-256 y el hash del fichero cifrado. La recuperación
descifra ese mismo artefacto en el runner aislado antes de comprobar PostgreSQL
y Storage. Una contraseña errónea o un paquete alterado no dejan una salida
descifrada aceptada. Los archivos sin cifrar no se incluyen en la subida.
Los errores al cargar SQL se reducen a un código de fallo, porque PostgreSQL
puede incluir valores de la fila fallida en su diagnóstico. CI lo comprueba
con un importe sintético inválido y exige que su contenido no aparezca en logs.

Configurar en [Secrets de GitHub Actions](https://github.com/massmedi-cpu/Finanzas-3.0/settings/secrets/actions):

- `FINANCIAL_APP_DB_PASSWORD`: contraseña de PostgreSQL; ya estaba configurada
  en el último intento de backup real.
- `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`: una credencial de servidor
  con acceso al objeto privado de Storage. El último intento no disponía de ninguna.
- `FINANCIAL_APP_BACKUP_PASSPHRASE`: secreto dedicado, aleatorio, de al menos
  32 caracteres en una sola línea. Guardar una copia en el gestor de contraseñas
  para recuperar los backups aunque se pierda acceso a GitHub. No reutilizar
  la contraseña de PostgreSQL ni las claves de Supabase.

No incluir los valores en PRs, comentarios, capturas ni conversaciones.
Después, ejecutar **Production Backup v2 10.0.35** desde la rama de trabajo y
exigir que terminen correctamente los jobs de creación y recuperación del
paquete descargado. El artefacto de Actions caduca a los siete días: conservar
el paquete cifrado y su hash en un destino de backup duradero antes del corte.
Task 30 permanece abierta hasta disponer de esa copia completa recuperada.
