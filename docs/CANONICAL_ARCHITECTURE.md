# Financial App — Arquitectura canónica vigente

Actualizada para Financial App 6.4.7. La baseline arquitectónica se cerró en Financial App 5.0.0; las versiones posteriores evolucionan esa misma arquitectura sin crear un runtime paralelo. Este documento define el criterio técnico del código activo. El historial de migraciones y auditorías conserva decisiones anteriores, pero no constituye una segunda arquitectura runtime.

## Principios

- Una sola implementación canónica por responsabilidad.
- El código runtime no conserva loaders, RPC, componentes o estilos sustituidos.
- Las regresiones históricas se conservan como pruebas y migraciones, no como capas activas.
- La fuente financiera externa permanece en solo lectura; Financial App nunca reescribe el origen.
- La lógica financiera vive en servidor/PostgreSQL y la UI consume contratos compactos y tipados.
- Las sugerencias automáticas no mutan datos financieros sin una acción explícita y auditable.
- Las correcciones se hacen sobre la causa raíz y eliminan la implementación sustituida.
- La versión visible (`lib/app-version.ts`) y la versión técnica npm son independientes.
- Optimización y limpieza se justifican con evidencia: no se añaden ni eliminan capas, índices o dependencias solo por intuición.

## Runtime actual

- Next.js 16 + React 19 sobre Node 22.
- Vercel sirve la aplicación privada y despliega producción desde `main`.
- Las previews automáticas están bloqueadas; solo se crean deliberadamente si una validación concreta las requiere.
- Supabase aporta Auth, PostgreSQL, RPC y Edge Functions de sincronización.
- El esquema `financial_app` contiene la lógica privada; `public.financial_app_*` expone únicamente wrappers controlados necesarios para la aplicación.

## Inicio

La ruta crítica de Inicio usa exclusivamente `financial_app_home_pulse` mediante `lib/financial/home-pulse.ts`.

- Ingresos, gastos, cash flow, revisión, último movimiento y estado de sincronización se resuelven en una sola pasada.
- Las cuentas se cargan en paralelo mediante `financial_app_accounts` y `getAccountsOverview()`.
- Las secciones secundarias continúan en streaming y no bloquean la primera pantalla.
- `financial_app_dashboard`, `financial_app_home_overview`, `dashboard_rpc` y `home_overview_core` están retirados.
- `lib/financial/dashboard.ts` y `lib/financial/home.ts` no forman parte del runtime canónico.

## Datos y movimientos

- `financial_app.transactions` conserva el dato normalizado y la procedencia de origen.
- Ajustes privados, reglas, splits y conciliación respetan precedencia explícita y trazabilidad.
- Traspasos internos, duplicados, movimientos ausentes en origen y exclusiones de cash flow se tratan en los motores canónicos de servidor.
- Las operaciones masivas de edición usan IDs seleccionados, límite de 200, bloqueo determinista, historial por movimiento y deshacer seguro cuando ningún elemento cambió después.
- La selección masiva puede conservarse al paginar o cambiar filtros; el contador mostrado representa siempre el lote completo que se enviará al servidor.
- Desde 6.4.7 la edición múltiple ofrece también concepto normalizado, comercio/contraparte, descripción y notas mediante opt-in explícito; un campo no activado nunca se modifica y un valor vacío restaura/elimina únicamente el override privado conforme al contrato individual existente.
- La fecha efectiva no se ofrece en lote: permanece como edición individual para evitar asignar accidentalmente una misma fecha a movimientos diferentes.
- El lote sigue delegando cada modificación en `update_transaction_rpc`; no existe un segundo motor de edición masiva ni una semántica paralela para historial o deshacer.
- Desde 6.4.4 la automatización masiva 4.0 no forma parte del runtime activo. Su migración histórica se conserva únicamente como trazabilidad.
- Movimientos no ejecuta matching documental propio ni una orquestación paralela de reglas/documentos/conciliación.

## Previsión e inteligencia

- Previsión usa el ledger/calendario canónico con matching real 1↔1, descartes reversibles y proyección mensual calculada en servidor.
- Matching observability mide calidad sin persistir valores financieros derivados.
- Inteligencia financiera reutiliza señales canónicas para anomalías, recurrencias, subidas y oportunidades, sin inventar cifras ni mutar movimientos.

## Documentos, OCR y Google Drive

- La sincronización de Drive es incremental y preserva el original externo.
- La frontera canónica de normalización de metadatos de Drive es `financial_app.drive_document_rows(jsonb)`. Desde 6.4.5 admite como fallback la convención real `YYYYMMDD Comercio importe` además del formato con guiones, de modo que fecha, importe y comercio se normalizan antes del matching.
- La normalización de nombres no crea asociaciones ni un motor de scoring: entrega metadatos al matching documental 6.x ya existente.
- Desde 6.4.6, si una migración de ciclo de vida deja documentos de Drive archivados después de inicializar el cursor incremental, la reconciliación invalida una sola vez ese cursor y el siguiente sync autenticado hace un full scan. Solo se reactivan IDs que Google Drive confirma presentes; nunca hay desarchivado masivo por suposición.
- Mientras esa reconciliación está pendiente, Inicio expone el estado sin presentar la invalidación del cursor como una sincronización real.
- Los documentos se deduplican por identidad/contenido y se vinculan a movimientos mediante un único matching documental supervisado.
- PP-OCRv6 preserva geometría y reconstrucción de tickets/documentos comerciales sin convertir la imagen en una segunda fuente financiera.
- `document_triage_core` es la cola canónica de prioridad documental.
- El matching usa una política supervisada versionada. Los umbrales no se autoajustan ni se relajan automáticamente.
- El Centro de operaciones documentales 6.4 orquesta sobre triage y matching existentes: no crea un segundo motor.
- Solo las operaciones que el servidor marca como seguras pueden entrar en lote y cada una se revalida de nuevo justo antes de escribir.
- Las asociaciones reutilizan el core calibrado y el archivado conserva historial reversible.
- Los casos ambiguos, OCR fallido, metadatos incompletos o decisiones manuales permanecen fuera de la automatización segura.

## Estilos

- Shell y primitivas compartidas: `app/globals.css`, `app/controls.css`, `app/chrome.css`, `app/typography.css`, `app/visual.css`.
- Cada módulo carga sus estilos desde su propio layout o superficie.
- No deben existir hojas runtime `*-vNNN.css` ni `*-advanced.css`.

## Seguridad

- Google OAuth + allowlist de servidor para la sesión privada.
- El navegador nunca recibe `service_role` ni secretos Google/Supabase privados.
- RLS y privilegios mantienen las tablas privadas cerradas por defecto.
- `anon` no ejecuta operaciones privilegiadas.
- Los wrappers públicos necesarios deben ser `SECURITY INVOKER` cuando el contrato lo permita.
- Los cores `SECURITY DEFINER` que sean imprescindibles viven fuera del API público, usan `search_path` cerrado, permisos mínimos y vuelven a validar la autorización de servidor mediante `authorized_email()` cuando corresponda.
- `financial_app_document_matching_dashboard` sigue este patrón desde 6.4.2: el wrapper público es invoker y el core privilegiado permanece en `financial_app` con autorización explícita.
- La condición `authenticated` no equivale a autorización: una frontera privilegiada debe verificar además la identidad permitida.
- Los advisors de Supabase forman parte de la verificación tras cambios de esquema; sus avisos se corrigen con alcance medido, no mediante cambios masivos sin evidencia.
- Código sin uso que conserve permisos privilegiados o una lógica paralela se retira del runtime cuando la evidencia demuestra que ya no es necesario.

## Release

Toda release debe superar, como mínimo:

1. AXIOMA estructural y arquitectura canónica.
2. Gates históricos forward-compatible; dentro de una misma familia de patch deben proteger la baseline por rango mínimo y no por enumeración manual de cada versión futura.
3. Gate de la versión actual.
4. Auditoría de dependencias, lint, TypeScript y build reproducible.
5. Migración Supabase compatible y verificada sin mutar datos de origen cuando exista cambio de base de datos.
6. CI verde sobre la rama de trabajo.
7. Merge a `main` y un único despliegue de producción desde el SHA validado.
8. Deployment Vercel `READY` y cabecera de versión exacta.
9. Alineación final de metadata de Supabase cuando proceda.
10. Production smoke sobre dominio canónico, rutas privadas y frontera API. Desde 6.4.3 la versión se considera propagada únicamente cuando login, las rutas protegidas y las APIs privadas alcanzan la versión esperada en dos pasadas consecutivas antes de la verificación final.

`npm run audit:current` protege las reglas canónicas y los gates históricos impiden reintroducir implementaciones sustituidas.
