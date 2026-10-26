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
