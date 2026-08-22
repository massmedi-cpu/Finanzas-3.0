# Supabase backend — Financial App 1.7.0

Este árbol contiene únicamente las Edge Functions pertenecientes al runtime actual de Financial App.

| Function | Estado | `verify_jwt` | Uso |
|---|---|---:|---|
| `financial-app-sync` | activa | true | sincronización incremental desde la fuente de solo lectura |
| `financial-app-preview-session` | temporal | false | canje de ticket de Preview; valida token de un solo uso dentro de la función |
| `financial-app-initial-import` | deshabilitada | true | responde `410 Gone`; se conserva versionada para que el backend desplegado sea reproducible |

Las funciones heredadas `finanzas-v3-*` se han retirado de esta rama porque no forman parte de Financial App 1.7.0. Permanecen en el historial Git y algunas pueden seguir desplegadas en el proyecto Supabase compartido; no deben eliminarse del entorno remoto sin confirmar antes que ninguna aplicación antigua las consume.

## Reglas
- No guardar secretos, service-role keys ni credenciales de Google Drive.
- Las tablas `financial_app.*` mantienen RLS activo y no se exponen directamente al cliente.
- Los wrappers públicos verifican autorización mediante `financial_app.authorized_email()` en sus núcleos `SECURITY DEFINER`.
- La fuente bancaria continúa en modo solo lectura; las ediciones viven en la capa privada.
