# Supabase backend — Financial App 6.0.0

Este árbol contiene únicamente las Edge Functions pertenecientes al runtime activo o a cierres explícitos de compatibilidad de Financial App.

| Function | Estado | `verify_jwt` | Uso |
|---|---|---:|---|
| `financial-app-sync` | activa | true | sincronización incremental desde la fuente externa de solo lectura |
| `financial-app-initial-import` | deshabilitada | true | responde `410 Gone`; tombstone controlado de una función retirada |

## Autenticación

Google OAuth + allowlist de servidor es el único flujo interactivo de acceso a Financial App.

La autenticación temporal de Preview fue retirada en 6.0.0. El RPC `financial_app_claim_preview_login` y la tabla `financial_app.preview_login_tokens` se eliminan idempotentemente en el cierre 6.0.0. La antigua Edge Function `financial-app-preview-session` no forma parte del código activo; si permanece desplegada como tombstone remoto, exige JWT y responde `410 Gone`.

Las migraciones antiguas se conservan en Git únicamente como historial y no representan superficies runtime vigentes.

## Reglas

- No guardar secretos, service-role keys ni credenciales de Google Drive en el repositorio o el navegador.
- Las tablas `financial_app.*` mantienen las restricciones de acceso definidas por la arquitectura canónica.
- Las funciones privilegiadas deben tener un uso justificado, permisos mínimos y gates explícitos.
- La fuente bancaria/documental externa continúa en modo solo lectura; las ediciones viven en la capa privada.
- Las ramas de desarrollo no modifican metadatos de versión de producción; la alineación exacta se realiza únicamente durante el release a `main`.
