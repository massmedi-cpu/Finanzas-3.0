# Sync observability acceptance criteria

- Post-write verification reads canonical persisted Home Pulse state after each sync.
- UI distinguishes unchanged XLSX, verified movement deltas, and changed-source/zero-delta warnings.
- User-visible result includes parsed rows when available, new/updated counts, source removals, latest persisted movement date, document changes, and auto-links.
- Diagnostics failure never masquerades as verified success.
- Drive source remains read-only and existing incremental import semantics remain unchanged.
