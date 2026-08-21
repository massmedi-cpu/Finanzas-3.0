# Release gate — V2.0.2

Base estable: V2.0.1 / `f632245977d0195dc95a95064319c076efa42bd4`.
Rama: `develop/v2.0.2-hardening`.
PR: #12.

## Alcance

Parche de hardening. No modifica lógica financiera, fuente bancaria, overlay privado ni esquema de Supabase.

## Gates

- [x] Regresiones financieras existentes sin cambios.
- [x] TypeScript estricto.
- [x] Build de producción.
- [x] Smoke sobre `next start` del build real.
- [x] Rutas y APIs privadas bloqueadas sin sesión.
- [x] Manifest/icono/robots y cabeceras de seguridad validados.
- [x] Login con formulario en primer HTML y sin bailout exclusivamente cliente.
- [x] Login prerenderizado confirmado en preview Vercel.
- [x] Preview del código de hardening READY.
- [ ] Versionado 2.0.2 alineado en package, lockfile y `src/version.ts`.
- [ ] CI del HEAD final.
- [ ] Preview del HEAD final READY.
- [ ] Merge a `main`.
- [ ] Smoke automático de producción V2.0.2.
- [ ] `/api/health` producción = 2.0.2 y sin errores runtime.

El merge solo se realiza cuando todos los gates previos a producción están demostrados sobre el HEAD exacto.
