# Supabase release preflight

Financial App checks the live Supabase contract before every production/preview build.

The preflight:

- reads the canonical public Supabase configuration already used by the app;
- extracts the product `APP_VERSION` from `lib/app-version.ts`;
- discovers every `financial_app_*` RPC referenced by the application and Edge Functions;
- calls the safe `financial_app_release_preflight` manifest in Supabase;
- fails the build when DB `app_version` / `target_version` do not match the code or when any required RPC is absent.

The manifest exposes only release metadata and function names. It does not expose transactions, users, documents or other financial data.
