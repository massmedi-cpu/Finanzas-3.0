# Supabase backend — Finanzas 3.0 V2.0.1

Versionado de las Edge Functions exclusivas de Finanzas 3.0:

| Function | Producción auditada | `verify_jwt` | Autenticación real |
|---|---:|---:|---|
| `finanzas-v3-bridge` | v4 | false | token privado de aplicación |
| `finanzas-v3-data` | v2 | false | token privado de aplicación |
| `finanzas-v3-recurring` | v1 | false | token privado de aplicación |
| `finanzas-v3-splits` | v1 | false | token privado de aplicación |

`verify_jwt=false` es deliberado por compatibilidad con la sesión privada existente. Cada función valida el bearer token antes de acceder a datos. Las tablas V3 tienen RLS habilitado, no tienen políticas públicas y el acceso de datos se realiza con `SUPABASE_SERVICE_ROLE_KEY` exclusivamente dentro de Edge Functions.

No guardar en este árbol secretos, claves service-role, credenciales de Drive ni el código legado sensible de `finanzas-alberto-api`.
