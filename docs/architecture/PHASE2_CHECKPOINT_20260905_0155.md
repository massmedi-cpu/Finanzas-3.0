# Fase 2 — Checkpoint acumulativo 05/09/2026 01:55 Europe/Madrid

Este documento añade evidencia al estado canónico `PHASE2_VALIDATION_STATUS.md`; no sustituye validaciones anteriores.

## Estado oficial

- Fase 1: **100%** cerrada en `main`.
- Fase 2: **88% validado**.
- Progreso global: **16,8%**.
- Rama: `rebuild/phase-2-data-quality`.
- PR: #287, Draft.
- HEAD validado antes de este checkpoint: `ee68f4ea3f1c00f2e9e96ea0e71a46f9a99f7265`.
- Último SHA de runtime: `7bbe489bf18f68c77f00beb72cccc55f492caa76`.

## Evidencia CI exacta

GitHub Actions run `33930592739` sobre `ee68f4ea…`:

- build Next.js: success;
- TypeScript: success;
- Playwright/core-health: success;
- **94 tests totales · 82 passed · 12 skipped · 0 failed**;
- desktop y móvil verdes;
- los 12 skipped son exclusivamente los gates live del preview protegido.

El test de configuración queda endurecido: una instalación sin credenciales externas solo puede exigir `clientId` y `clientSecret`; `allowedEmail` no puede reaparecer como variable de Vercel.

## Política Google privada cerrada técnicamente

La cuenta Google permitida se ha trasladado a una fuente de verdad privada en Supabase:

- `20260904231301_google_source_private_policy`;
- verificación fail-closed antes de almacenar OAuth;
- política ausente o correo distinto son rechazados;
- `anon` y `authenticated` no tienen acceso directo;
- `20260904233200_google_source_policy_explicit_deny` hace explícita la denegación RLS;
- Security Advisor final: **0 lints**;
- regresión PostgreSQL: rollback limpio, sin conexiones/mappings/movimientos sintéticos residuales.

## Edge Gateway

`financial-app-db-gateway` está **ACTIVE v12**. La autenticación propia Vercel OIDC permanece delante de PostgreSQL y el gateway sirve la nueva política privada sin exponerla al navegador como configuración editable.

## Vercel

- deployment READY del runtime `7bbe489b…`: `dpl_GJ16p8dGqChS1weBKEeZ1G8fPKFK`;
- `ee68f4ea…` no obtuvo deployment propio porque Vercel devolvió `Deployment rate limited — retry in 24 hours`;
- no se crea un deployment manual alternativo ni se promueve nada a producción;
- `main` permanece intacto.

## Protected preview

El workflow genera correctamente el token OIDC de GitHub, pero Vercel no autoriza actualmente ese token para la rama Phase 2. El acceso se prueba 24 veces y termina sin HTTP 200; por ello el job live se omite de forma deliberada.

No se consideran válidos como gate:

- respuestas 302 hacia SSO;
- share links que no establecen una sesión reutilizable;
- previews de otro SHA;
- pruebas locales que no crucen Deployment Protection.

Se añade diagnóstico seguro al workflow para imprimir únicamente claims no secretos (`iss`, `aud`, `sub`, repositorio, ref y workflow) y el status HTTP final. El JWT completo nunca se imprime.

## Próximos gates reales

1. Obtener `CLIENT_ID` y `CLIENT_SECRET` reales de Google OAuth Web.
2. Autorizar la cuenta permitida y ejecutar preflight real.
3. Primera importación persistente real, contrastada con el baseline reconciliado de 3.172 movimientos / 3 productos.
4. Segunda sincronización real para demostrar idempotencia end-to-end.
5. Verificar revisiones, overrides, trazabilidad y prepago archivada en persistencia real.
6. Corregir Trusted Source/Automation Bypass de Vercel y ejecutar el live protegido sobre SHA exacto.
7. Reejecutar regresiones acumulativas de Fase 1.
8. Cerrar Gantt y PR únicamente con todos los gates verdes.

OCR continúa aislado para Fase 11.
