# REC-SYNC-410/512 — 30 altas sintéticas (27+3), replay y rollback en PostgreSQL 17 restaurado

Fecha de preparación: 24/10/2026. PR #619; NO-GO antes de las puertas finales.

Esta prueba ejecutable en CI usa **exclusivamente** la base restaurada de la copia cifrada real 10.0.103 en localhost y las funciones SQL auténticas de ingreso. Está unida al job `restored-production-103-ap8-619`, cuya identidad de PR, SHA, backup y entorno se verifican antes de restaurar. No conecta con los servidores bancarios ni con Google.

El fichero `supabase/tests/rec_sync_append_only_restored_103.sql` crea dos espacios **sintéticos** dentro de una transacción descartable e invoca `financial_app.ingest_source_observation` con **30 observaciones sintéticas de 22 columnas, 27 de cuenta corriente y 3 de ahorro**, representando el volumen pendiente confirmado el 01/11/2026. Primero simula el batch atómico que inserta 20 movimientos y recibe una revisión histórica: reproduce la decisión `append_revision -> excepción` y verifica que la subtransacción revierte fuentes, transacciones, cursores y registros de sincronización. Después ensaya 30 `insert`, 30 `skip` en replay sin duplicados, suma de importes de prueba, ausencia de superseded rows y aislamiento RLS al cambiar de workspace. Finalmente hace ROLLBACK del conjunto y verifica que no quedan ni espacios ni fuentes sintéticas.

El script `rec-ap8-restored-backup-rehearsal.sh` exige el marcador privado de finalización sin imprimir los datos de la copia restaurada; el test mantiene los digest globales de las 32 tablas ya existentes antes/después de las cuatro migraciones y sus reversiones.

**Alcance honesto:** valida la lógica SQL de inserción, replay, conflicto y aislamiento con registros sintéticos sobre una restauración auténtica anterior. No demuestra la ejecución end-to-end del handler Vercel+Google ni constituye respaldo fresco del estado de producción inmediatamente anterior al lanzamiento. No autoriza desplegar gateway, importar las 20 altas reales ni publicar sin AP2/AP5/AP8 restantes.


## REC-SYNC-512 · ampliación revisada 01/11/2026

Sin usar filas bancarias privadas, el ensayo reemplaza las anteriores 20 altas de prueba por **30 observaciones sintéticas en dos productos: 27 checking y 3 savings**. Comprueba inserción atómica, replay idempotente de las 30, preservación de históricos ante revisión inválida, aislamiento por workspace, cuentas y pestañas separadas, suma íntegra de importes sintéticos (-46.500 céntimos) y rollback sin residuos. El marcador de éxito exige expresamente `inserts=30|replay_skips=30|checking=27|savings=3`; el shell de restauración falla en cerrado si no se presenta. No se han extraído ni incorporado los 30 movimientos bancarios reales a la prueba. No cambia la seguridad o el alcance productivo ni cierra el gate B2.04.
