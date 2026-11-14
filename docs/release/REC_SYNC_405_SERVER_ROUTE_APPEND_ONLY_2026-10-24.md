# REC-SYNC-405 — Strictly audited append-only server integration (24/10/2026)

**PR #619 DRAFT, NO-GO.** This is candidate-only code; production 10.0.103 and gateway v86 are untouched.

The POST route still requires user session, current Google snapshot, strict preflight and exact confirmation. Its existing normal path still rejects every changed historical fingerprint. A legacy gateway cannot use the exception.

Only a fingerprint-only difference with no orphans may be examined further. The production-only gateway must explicitly declare `sourceImmutableOriginalRows===true`. A separate private read obtains all 22 original cell values, original hashes and financial metadata; the plan audits these, permits only DD/MM/YYYY -> same-day Sheets integer date with 21 other typed cells unchanged, then checks a second independent eight-field preflight for races. Anything else aborts before writing. Old payload and old fingerprint are kept unchanged. New observations use Google original cells.

`SourceSyncService.synchronizePreparedBatch` sends the verified canonical plan. No changes to the legacy SQL ingestion guard: all rows run inside one transaction and advisory lock; any revision rolls back every insertion. Receipt + zero revised rows + a new independent canonical postflight must verify all expected source rows (including new rows), otherwise status remains unconfirmed. This postflight is proof against the original-hash canonical plan, not a claim that the altered Google date serial has the same byte hash.

Tests REC-SYNC-400–405 cover pure snapshot proofs, exceptional route gating and normal route unchanged. Full tests/CI, PG17 restore/race/rollback, fresh encrypted production backup, gateway v86 upgrade and authenticated QA remain required **before any live sync, merge, or release**.


## REC-SYNC-406: comprehensive immutable-original postflight
The exceptional route rereads every 22-cell JSONB payload after SQL writes, recalculates source fingerprints with the same strict audit, verifies no changed/pending/orphaned records, and cross-checks the independent eight-field postflight before reporting success. Even a manipulated payload with an unchanged eight-field fingerprint fails. Reads are sequential (not a shared Google/DB snapshot); an uncertain write is NEVER automatically retried. Test REC-SYNC-406 includes tampering scenario. No production deployment or migrations.
