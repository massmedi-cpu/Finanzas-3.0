# REC-SYNC-410 — 20 altas, replay y rollback en restauración PostgreSQL 17

Fecha de preparación: 24/10/2026. PR #619; NO-GO antes de las puertas finales.

Esta prueba ejecutable en CI usa **exclusivamente** la base restaurada de la copia cifrada real 10.0.103 en localhost y las funciones SQL auténticas de ingreso. Está unida al job `restored-production-103-ap8-619`, cuya identidad de PR, SHA, backup y entorno se verifican antes de restaurar. No conecta con los servidores bancarios ni con Google.

El fichero `supabase/tests/rec_sync_append_only_restored_103.sql` crea dos espacios **sintéticos** dentro de una transacción descartable e invoca `financial_app.ingest_source_observation` con 20 observaciones de 22 columnas. Primero simula el batch atómico que inserta 20 movimientos y recibe una revisión histórica: reproduce la decisión `append_revision -> excepción` y verifica que la subtransacción revierte fuentes, transacciones, cursores y registros de sincronización. Después ensaya 20 `insert`, 20 `skip` en replay sin duplicados, suma de importes de prueba, ausencia de superseded rows y aislamiento RLS al cambiar de workspace. Finalmente hace ROLLBACK del conjunto y verifica que no quedan ni espacios ni fuentes sintéticas.

El script `rec-ap8-restored-backup-rehearsal.sh` exige el marcador privado de finalización sin imprimir los datos de la copia restaurada; el test mantiene los digest globales de las 32 tablas ya existentes antes/después de las cuatro migraciones y sus reversiones.

**Alcance honesto:** valida la lógica SQL de inserción, replay, conflicto y aislamiento con registros sintéticos sobre una restauración auténtica anterior. No demuestra la ejecución end-to-end del handler Vercel+Google ni constituye respaldo fresco del estado de producción inmediatamente anterior al lanzamiento. No autoriza desplegar gateway, importar las 20 altas reales ni publicar sin AP2/AP5/AP8 restantes.
