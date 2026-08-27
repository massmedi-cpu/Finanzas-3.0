# Financial App 5.0.0 — Arquitectura canónica

Este documento define el criterio técnico vigente del código activo. El historial de migraciones y auditorías conserva decisiones anteriores, pero no constituye una segunda arquitectura runtime.

## Principios

- Una sola implementación canónica por responsabilidad.
- El código runtime no conserva loaders, RPC, componentes o estilos sustituidos.
- Las regresiones históricas se conservan como pruebas y migraciones, no como capas activas.
- La fuente financiera externa permanece en solo lectura; Financial App nunca reescribe el origen.
- La lógica financiera vive en servidor/PostgreSQL y la UI consume contratos compactos y tipados.
- Las sugerencias automáticas no mutan datos financieros sin una acción explícita y auditable.
- Las correcciones se hacen sobre la causa raíz y eliminan la implementación sustituida.
- La versión visible (`lib/app-version.ts`) y la versión técnica npm son independientes.

## Runtime actual

- Next.js 16 + React 19 sobre Node 22.
- Vercel sirve la aplicación privada y el shell responsive.
- Supabase aporta Auth, PostgreSQL, RPC y Edge Functions de sincronización/Preview.
- El esquema `financial_app` contiene la lógica privada; `public.financial_app_*` expone únicamente wrappers controlados necesarios para la aplicación.

## Inicio

La ruta crítica de Inicio usa exclusivamente `financial_app_home_pulse` mediante `lib/financial/home-pulse.ts`.

- Ingresos, gastos, cash flow, revisión, último movimiento y estado de sincronización se resuelven en una sola pasada.
- Las cuentas se cargan en paralelo mediante `financial_app_accounts` y `getAccountsOverview()`.
- Las secciones secundarias continúan en streaming y no bloquean la primera pantalla.
- `financial_app_dashboard`, `financial_app_home_overview`, `dashboard_rpc` y `home_overview_core` están retirados en 5.0.0.
- `lib/financial/dashboard.ts` y `lib/financial/home.ts` no forman parte del runtime 5.0.0.

## Datos y movimientos

- `financial_app.transactions` conserva el dato normalizado y la procedencia de origen.
- Ajustes privados, reglas, splits, conciliación y automatizaciones respetan precedencia explícita y trazabilidad.
- Traspasos internos, duplicados, movimientos ausentes en origen y exclusiones de cash flow se tratan en los motores canónicos de servidor.
- Las operaciones masivas usan IDs seleccionados, historial y deshacer cuando corresponde.

## Previsión e inteligencia

- Previsión usa el ledger/calendario canónico con matching real 1↔1, descartes reversibles y proyección mensual calculada en servidor.
- Matching observability mide calidad sin persistir valores financieros derivados.
- Inteligencia financiera reutiliza señales canónicas para anomalías, recurrencias, subidas y oportunidades, sin inventar cifras ni mutar movimientos.

## Documentos y Google Drive

- La sincronización de Drive es incremental y preserva el original externo.
- Los documentos se deduplican por identidad/contenido y se vinculan a movimientos mediante matching conservador.
- Los enlaces exactos pueden automatizarse dentro de los límites de seguridad; casos ambiguos permanecen en revisión.
- OCR local se usa cuando el documento lo necesita y no crea una segunda fuente financiera.

## Estilos

- Shell y primitivas compartidas: `app/globals.css`, `app/controls.css`, `app/chrome.css`, `app/typography.css`, `app/visual.css`.
- Cada módulo carga sus estilos desde su propio layout o superficie.
- No deben existir hojas runtime `*-vNNN.css` ni `*-advanced.css`.

## Seguridad

- Google OAuth + allowlist de servidor para la sesión privada.
- El navegador nunca recibe `service_role` ni secretos Google.
- RLS/privilegios mantienen los datos privados cerrados por defecto.
- Funciones privilegiadas requieren frontera explícita y se auditan antes de release.
- Preview autenticada usa token one-time y permanece desactivada en producción.

## Release

Toda release debe superar, como mínimo:

1. AXIOMA estructural y arquitectura canónica.
2. Gates históricos forward-compatible.
3. Gate de la versión actual.
4. Auditoría de dependencias, lint, TypeScript y build reproducible.
5. Preview del mismo SHA validado.
6. Migración Supabase verificada sin mutar datos de origen.
7. Merge a `main`, despliegue READY y smoke de producción.

`npm run audit:current` protege las reglas canónicas y `npm run audit:v500` impide reintroducir la cadena Home/Dashboard retirada en 5.0.0.
