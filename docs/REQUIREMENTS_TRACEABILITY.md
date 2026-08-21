# Trazabilidad de requisitos — Finanzas 3.0 V2.0.1

| Requisito permanente | Implementación / evidencia | Estado |
|---|---|---|
| Fuente bancaria de solo lectura | Bridge solo lee Drive; ajustes en tablas privadas | Cumplido |
| No modificar datos originales | `rowsForAnalytics` / `rowsForBudgetAndReports` crean vista derivada | Cumplido |
| Traspasos internos fuera de ingresos/gastos | `finance-engine.isTransfer` + tests | Cumplido |
| Transferencia externa conservada | Regresión automatizada | Cumplido |
| Edición reversible | `finance_v3_movement_overrides` + restauración | Cumplido |
| División reversible | `finance_v3_movement_splits` + RPC replace/delete | Cumplido |
| División cuadra con original | Validación frontend/backend/RPC, tolerancia 0,01 EUR | Cumplido |
| Presupuestos por sobres | `budget-engine`, página Presupuestos | Cumplido |
| Recurrentes controlables | `forecast-engine`, preferencias privadas | Cumplido |
| Previsión y escenarios | Previsión + eventos futuros + escenarios | Cumplido |
| Objetivos | `finance_v3_goals` + Objetivos | Cumplido |
| Informes cash flow | Informes anual/trimestral/mensual/categorías | Cumplido |
| Calidad/duplicados/revisión | `quality-engine` + Centro de revisión | Cumplido |
| Correcciones privadas afectan alertas | Calidad calculada sobre vista efectiva | Cumplido V2.0.1 |
| No mostrar cifras parciales | Páginas derivadas bloquean cálculo si falta capa necesaria | Cumplido V2.0.1 |
| Acceso privado | Login + cookie privada + proxy + validación backend | Cumplido |
| Sin secretos en repo | `.gitignore`, `.env.example`, Edge Functions usan `Deno.env` | Cumplido para V3 |
| RLS | 10 tablas `finance_v3_*` con RLS y sin políticas públicas | Cumplido |
| RPC privilegiadas no públicas | `anon_execute=false`, `authenticated_execute=false` | Cumplido |
| Responsive/mobile-first | CSS con breakpoints 900/620 y tablas desplazables | Cumplido; revisar visualmente por versión |
| Estados de carga/error | `app/loading.tsx` y estados por página | Cumplido |
| Evitar prefetch pesado | `prefetch={false}` en navegación/rutas dinámicas | Cumplido V2.0.1 |
| Evitar reprocesado XLSX sin cambio | Bridge V4 usa `modifiedTime` y caché | Cumplido V2.0.1 |
| Paralelizar lecturas | `Promise.all` en páginas/componentes | Cumplido V2.0.1 |
| Evitar DOM masivo | Movimientos por bloques de 100 | Cumplido para volumen actual |
| Escala 100k+ | Tablas normalizadas existen; migración de lectura aún no activada | Deuda planificada, no bloqueante V2.0.1 |
| Dependencias reproducibles | Versiones fijadas + `package-lock.json` + `npm ci` | Cumplido V2.0.1 |
| CI de regresión | tests → typecheck → production build | Cumplido |
| Rollback/checkpoint | rama `checkpoint/v2.0.0-pre-audit` + baseline V2.0.0 | Cumplido |
| Documentación canónica | Axiomas, arquitectura, trazabilidad, changelog, diseño, test matrix | Cumplido V2.0.1 |
