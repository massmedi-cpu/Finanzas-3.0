# Financial App 3.7.4 — audit fixes

This release closes the first high-priority audit block without adding compatibility layers or duplicating architecture.

## Scope

- Archive pagination through the existing `p_limit` / `p_offset` RPC contract so documents beyond the first page remain reachable.
- Consistent unauthenticated API contract: JSON `401` instead of HTML/login redirects; authenticated users without access receive `403`.
- Explicit hardening of Financial App internal `SECURITY DEFINER` functions and `forecast_event_overrides` permissions.
- Canonical application version synchronized across UI, package metadata and database release metadata.
- Production smoke coverage expanded from `/login` to protected pages and representative API endpoints.

## Release rule

The database migration `database/FINANCIAL_APP_3.7.4_AUDIT_SECURITY.sql` is applied only after the application release passes CI and the production deployment is ready.
