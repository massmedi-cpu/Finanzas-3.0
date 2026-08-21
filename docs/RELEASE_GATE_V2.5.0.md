# Release gate — Finanzas 3.0 V2.5.0

## Funcional
- [x] Nueva sección Cierre.
- [x] Mes actual/no finalizado bloqueado.
- [x] Pendientes, no conciliados, sin categoría y duplicados bloquean cierre.
- [x] Desviaciones presupuestarias y cash flow negativo son advertencias documentables.
- [x] Comparación con mes anterior.
- [x] Cierre guarda fotografía de métricas.
- [x] Reapertura conserva historial append-only.
- [x] Drift posterior a un cierre se detecta y pide reapertura.

## Datos y seguridad
- [x] Resumen usa `finance_v220_effective_rows`.
- [x] Fuente bancaria original intacta.
- [x] Tablas nuevas con RLS deny-by-default.
- [x] RPC service-role only.
- [x] Edge Function fail-closed para autenticación.
- [x] Migraciones aditivas y reversibles.

## Automatización
- [x] `month-close-tests.mjs` añadido a CI.
- [x] Smoke protege `/cierre` y `/api/private/month-closure`.
- [x] Invariantes protegen arquitectura V2.5.
- [ ] CI final del HEAD de cierre en verde.
- [ ] Preview final Vercel — se pospone al único preview de la cadena de releases.
