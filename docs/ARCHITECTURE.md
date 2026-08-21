# Financial App — Arquitectura 0.1.0

- Next.js App Router + React + TypeScript.
- Vercel como único entorno oficial de Preview/Production.
- Supabase/PostgreSQL dedicado: nunca compartir tablas con Salud Conectada o Trayectos Clio.
- Google OAuth gestionado por Supabase Auth; no existe contraseña propia.
- Identidad validada con `getClaims()` y autorización comprobada en servidor.
- Google Sheets es fuente externa read-only; la app opera contra PostgreSQL.
- Núcleo financiero centralizado en `lib/finance`; importes en céntimos enteros.

## Flujo
Google Sheets (solo lectura) → adaptador server-side → validación de estructura → hash → sincronización incremental → origen inmutable + overrides → núcleo financiero → UI.
