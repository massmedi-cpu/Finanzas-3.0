# Financial App 10.0.1 · evidencia de promoción

Fecha: 2026-09-09

## Objetivo

Promover a Production un checkpoint precomercial completamente validado sin esperar al cierre completo de la auditoría A–I.

Este release procede del checkpoint PRE-006 ya cerrado y excluye deliberadamente PRE-005 y CSP, que continúan su gate independiente en `audit/precommercial-10.0.0`.

## Base funcional validada

Checkpoint de origen: `32159de63f50e0d467fc965f021b64265f2d41bf`.

Incluye:

- PRE-007 cerrado y validado;
- PRE-006 cerrado y validado;
- regresión PRE-006 375 passed / 79 skipped / 0 failed;
- Vercel Preview exacto y Edge gateway alineados al checkpoint;
- Production 10.0.0 no se modificó durante esas validaciones.

## Identidad 10.0.1

La rama `release/10.0.1` sincronizó de forma determinista:

- `package.json` → 10.0.1;
- `package-lock.json` → 10.0.1 en raíz y paquete raíz;
- `src/core/build-info.ts` → fuente canónica `package.json` y nombre de fase 10.0.1.

El workflow temporal de preparación comprobó además que el lockfile sólo cambiaba de versión y no de semántica de dependencias.

## Gate de preparación de versión

Workflow exitoso: `34323417988`.

Sobre el candidato se ejecutaron correctamente:

- comprobación de versión inicial;
- sincronización de identidad 10.0.1;
- fingerprint semántico del lockfile;
- `npm ci`;
- build de producción;
- instalación de Chromium;
- regresión completa desktop + móvil;
- commit de identidad `7273c39e16192793dbe5fa355ac16fab911ec6ba`.

Una ejecución concurrente del mismo workflow perdió únicamente la carrera final de `git push`; no invalida el candidato porque la ejecución `34323417988` completó el mismo proceso con SUCCESS y publicó el commit de identidad.

El workflow temporal de bump fue eliminado después de cumplir su función para evitar ejecuciones futuras.

## Pipeline permanente de releases

`rebuild-preview-e2e.yml` acepta `release/*`, de modo que los PATCH posteriores pueden recibir la misma regresión que la rama de auditoría.

La promoción deja de depender del cierre total A–I: cada checkpoint PATCH debe demostrar por separado build, regresión, Preview exacto y prueba protegida antes de llegar a `main`.

## Parche de seguridad del framework

Antes de promover 10.0.1 se comprobó que la base 10.0.0 y el primer candidato seguían compilando con Next.js 16.3.1. El release actualiza de forma reproducible la dependencia y su lockfile a **Next.js 16.3.4**, sin cambios funcionales intencionados.

Candidato comprobado tras el parche: `faafcb99d78a5a2b90e640db164d482b0fcd3eb5`.

Run: `34326330280`.

Evidencia del build:

- `financial-app@10.0.1 build`;
- `Next.js 16.3.4 (Turbopack)`;
- compilación OK;
- TypeScript OK;
- generación de páginas OK.

La regresión local terminó con el workflow en SUCCESS. Un único test legado de Movimientos necesitó retry por la carrera de inicialización ya diagnosticada en la rama de auditoría; la aplicación no falló y el retry pasó.

## Estabilización determinista del gate de release

Para no promover Production apoyándose en retries, el release incorpora únicamente la corrección de test ya demostrada en auditoría:

- commit: `f9a4db309d53400243b05374cf4011478f7d7ae5`;
- archivo afectado: `tests/e2e/transactions.spec.ts`;
- el test espera a que el listado inicial muestre `1 de 2`, comprueba que el selector está habilitado y sólo entonces aplica `__uncategorized__`.

No se modifica lógica de Movimientos, APIs, persistencia, motores financieros ni UI de Production.

## Sello final

Este documento se commitea con `[vercel-preview]`. El SHA resultante es el único candidato final autorizado para Financial App 10.0.1.

No se debe fusionar PR #307 mientras no se cumpla todo lo siguiente sobre ese SHA exacto:

1. `browser-interaction-e2e` SUCCESS sin fallo final;
2. `protected-preview-live` SUCCESS;
3. Vercel Preview READY;
4. `/api/build` devuelve `version=10.0.1` y el mismo SHA exacto;
5. el build confirma Next.js 16.3.4;
6. no hay 5xx atribuibles al candidato;
7. Supabase Edge `financial-app-db-gateway` está ACTIVE cargando el mismo SHA exacto;
8. PR #307 sigue sin incluir PRE-005, CSP ni cambios posteriores de la auditoría.

Tras el merge deben comprobarse además:

- nuevo `main`;
- deployment Production READY;
- `/api/build` de Production = 10.0.1 y commit nuevo de `main`;
- autenticación y superficies principales operativas;
- ausencia de 5xx en el deployment Production.

Sólo después de esas comprobaciones puede declararse Financial App 10.0.1 publicada en Production.
