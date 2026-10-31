# REC-AP8-411 — Fresh encrypted backup dispatch for PR 619

Candidate 24/10/2026. **NO-GO until a NEW backup run and its restore actually succeed.**

The new workflow .github/workflows/rec-ap8-fresh-backup-dispatch.yml uses only GitHub Actions write permission, with NO database/storage/passphrase secrets. It dispatches the existing reviewed production-backup-v2.yml on main. It requires original-repository PR 619 and exact head/base branch and current PR head, then live production /api/build must report 10.0.103, SHA 6dad59c6c2db3575618a7c91c49c3060a93bbba1 and deployment dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5.

The canonical main workflow performs secret-bearing production READ, includes Storage, validates and encrypts the backup artifact, and restores into a local PostgreSQL17 database. This PR relay does not touch private values or run PR code with database secrets.

**A dispatch SUCCESS only proves the request was accepted.** Inspect the new workflow_dispatch run, both backup and restore job results, artifact integrity and freshness, and live DB state before marking AP8. If dispatch permission is denied, stop. AP5 actual import, gateway deployment, AP2 cloud and QA still remain.

REC-SYNC-410's synthetic 20-insert/rollback rehearsal succeeded against the authentic prior encrypted backup and does not replace a fresh release backup.
## REC-AP8-487 · 26/10/2026 · Retarget de PR #619 a main

La PR #619 cambió realmente de base histórica a **main** el 25/10, sin merge. La receta de dispatch permanecía conectada únicamente a la antigua base, por lo que las futuras sincronizaciones de código de esa PR no podían generar automáticamente un respaldo fresco para preparar el lanzamiento, aunque el runner AP8 restaurado ya admitía ambas bases. Esta incongruencia se subsana en el filtro de eventos, en el predicado de seguridad del job y en la comprobación **actual** de GitHub REST.

La autorización del relay sigue acotada a la PR #619 **abierta, del mismo repositorio, con la rama principal conocida**. Solo acepta las dos bases históricas permitidas; además comprueba que livePr.base.ref === event.base.ref y livePr.head.sha === event.head.sha para descartar eventos obsoletos. El relay no recibe credenciales de base de datos ni la frase de cifrado, no publica en Vercel y no escribe datos. Solo solicita al workflow canónico de main un respaldo cifrado cuando la identidad exacta de producción **10.0.103** coincide con la esperada.

La regresión REC-AP8-487 se añade al conjunto ap8-readiness-contract.spec.ts que ya está seleccionado por la matriz Playwright de Product Recovery. NO registrar como backup válido una ejecución del relay ni el resultado de esta regresión: se deben verificar por separado workflow_dispatch real, copia cifrada, almacenamiento, restauración PG17 y digest, y comprobar caducidad del artefacto. La sesión cloud de propietario sigue declinada; no se reintenta. Publicación sigue **NO-GO, 10/18 controles de release**; no se hace DDL, DML, sincronización ni merge en producción.

## REC-AP8-488 · 26/10/2026 · Respaldo real y nueva selección segura para ensayo PG17

El relé REC-AP8-487 terminó SUCCESS en GitHub run 40274197596. Solicitó el workflow canónico de main (run 40274402678), que terminó SUCCESS con tres jobs: validación, backup cifrado y restore-verify. El backup se creó 26/10/2026 05:33 UTC, fuente productiva SHA 6dad59c6... y versión 10.0.103. El ensayo de restore con PostgreSQL 17 mostró 3.188 movimientos y 3.188 originales; un bucket privado y un objeto verificados. Cero escrituras a bancos ni producción. Evidencia: https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/40274402678

Artifact GitHub cifrado y privado ID 12629204026; nombre financial-app-production-v2-6dad59c6c2db3575618a7c91c49c3060a93bbba1; SHA-256 de ZIP 82127e8e63475ea726e8739f31d7944cfbfe8fb472b5a358a05e637a185b4211, caducidad 02/11/2026 05:33 UTC. No se publican datos descifrados.

El workflow restored-production-103-ap8-619 cambia el pin anterior de 25/10 (run 40186296002, artifact 12596173399) por la copia auténtica del 26/10. Antes de descargar, valida el run main completado, origen versionado, fecha posterior a 26/10, expiración y SHA256; después descifra solo en runner temporal, restaura PostgreSQL17 y ensaya cinco migraciones selectivas, rollback y digest de datos. Se corrige la etiqueta de fecha obsoleta del log de restore. El test estático REC-AP8-488 comprueba el contrato.

IMPORTANTE: el respaldo del 26/10 tiene restore PASS, pero la nueva prueba de cinco migraciones contra ese artifact no queda aprobada hasta que termine el nuevo job restored-production-103-ap8-619 del commit que incorpora este pin. No equivale a validación owner cloud ni importa movimientos. PR #619 DRAFT, NO-GO, producción 10.0.103 intacta.
