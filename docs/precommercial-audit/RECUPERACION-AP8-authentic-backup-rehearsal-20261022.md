# REC-AP8-309/310 · Rehearsal sobre respaldo 10.0.103 verdadero, PR #619
Fecha: 22/10/2026. **No confundir con despliegue en producción.**

## Por qué existe
`.github/workflows/aud-e2e-production-backup-preflight.yml` pertenecía exclusivamente a PR #561 / v10.0.102; su único trabajo aparecía como SKIPPED bajo PR #619. Su restauración y migraciones ya no son un ensayo válido de la candidata 10.0.103.

## Nueva puerta independiente y sin infraestructura de pago
- El workflow mantiene íntegro el job antiguo de PR #561 e incorpora `restored-production-103-ap8-619`, solo accesible a **PR interna #619**, rama exacta y base exacta. El trigger acepta además la rama base y dos nuevos artefactos de código.
- Se fija el respaldo cifrado **run 39417500915 / artifact 12261579268**, SHA256 exacto y origen estable `6dad59c6c2db3575618a7c91c49c3060a93bbba1`, creado el **20/10/2026**. Caduca **27/10/2026 11:49 UTC**. Si no existe o cambia su digest, FALLA cerrado.
- Descifrado, validación y restauración exclusivamente en **PostgreSQL 17 en localhost de GitHub Actions**. No hay acceso a Supabase vivo, Google Drive, usuario adicional, clave de base productiva ni nuevos servicios. Ningún documento original, movimiento, dump, secreto o log privado se publica como artefacto.
- `scripts/rec-ap8-restored-backup-rehearsal.sh` comprueba la identidad exacta del backup, ruta PostgreSQL loopback, SHA del checkout, ausencia de credenciales productivas y versión. `supabase/tests/rec_ap8_restored_backup_upgrade_rollback.sql` exige restauración v10.0.103, toma huellas de **todas las tablas financieras**, conserva la firma y permisos de dos funciones y los predicados/roles de políticas RLS, aplica las cuatro migraciones del plan AP8, valida el trigger de inmutabilidad, ejecuta fixtures reversibles y hace **rollback completo** de funciones, RLS y trigger, comprobando huellas originales.
- En caso de fallo, solo se muestra un código fijo, nunca el log SQL privado. La base restaurada y el respaldo temporal se destruyen incondicionalmente.

## Evidencia y criterio de cierre
Cualquier éxito de `REC_AP8_REAL_BACKUP|status=ok` certificará únicamente la **repetición en aislamiento sobre la copia real del 20/10**, con rollback probado. No significa que el trigger esté desplegado en Supabase productivo, ni que Edge v86 se haya actualizado, ni que los 20 movimientos estén importados. Para la publicación se requiere respaldo **reciente**, comprobar permisos y aplicar y revalidar cambios productivos con rollback ya demostrado. La PR continúa DRAFT hasta completar OCR G5 y todas las puertas restantes.
