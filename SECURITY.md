# Seguridad
- Google OAuth exclusivamente; sin contraseñas propias.
- Usuario inicial autorizado: `massmedi@gmail.com`.
- Proxy + validación server-side en rutas privadas.
- Fuente bancaria con scope `spreadsheets.readonly` y credenciales solo servidor.
- RLS obligatorio en tablas expuestas.
- No registrar tokens, claves ni payloads financieros completos.
- Dependencias fijadas y lockfile obligatorio antes de merge a `main`.
