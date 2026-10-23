# REC-AP8-411 — Fresh encrypted backup dispatch for PR 619

Candidate 24/10/2026. **NO-GO until a NEW backup run and its restore actually succeed.**

The new workflow .github/workflows/rec-ap8-fresh-backup-dispatch.yml uses only GitHub Actions write permission, with NO database/storage/passphrase secrets. It dispatches the existing reviewed production-backup-v2.yml on main. It requires original-repository PR 619 and exact head/base branch and current PR head, then live production /api/build must report 10.0.103, SHA 6dad59c6c2db3575618a7c91c49c3060a93bbba1 and deployment dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5.

The canonical main workflow performs secret-bearing production READ, includes Storage, validates and encrypts the backup artifact, and restores into a local PostgreSQL17 database. This PR relay does not touch private values or run PR code with database secrets.

**A dispatch SUCCESS only proves the request was accepted.** Inspect the new workflow_dispatch run, both backup and restore job results, artifact integrity and freshness, and live DB state before marking AP8. If dispatch permission is denied, stop. AP5 actual import, gateway deployment, AP2 cloud and QA still remain.

REC-SYNC-410's synthetic 20-insert/rollback rehearsal succeeded against the authentic prior encrypted backup and does not replace a fresh release backup.