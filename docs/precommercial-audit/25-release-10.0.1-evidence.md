# Financial App 10.0.1 · evidencia de promoción

Fecha: 2026-09-09

## Objetivo

Promover a Production un checkpoint precomercial completamente validado sin esperar al cierre completo de la auditoría A–I.

Este release procede del checkpoint PRE-006 ya cerrado y excluye deliberadamente PRE-005, que continúa su gate independiente en `audit/precommercial-10.0.0`.

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

## Gate de preparación

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

El workflow temporal de bump fue eliminado después de cumplir su función, en `887abe749566aa03f1bf93fa9a4881b83b4c3f9f`, para evitar ejecuciones futuras.

## Pipeline permanente de releases

`rebuild-preview-e2e.yml` acepta ahora `release/*`, de modo que los PATCH posteriores pueden recibir la misma regresión que la rama de auditoría.

La promoción deja de depender del cierre total A–I: cada checkpoint PATCH debe demostrar por separado build, regresión, Preview exacto y prueba protegida antes de llegar a `main`.

## Sello final

Este documento se commitea con `[vercel-preview]` y convierte el commit resultante en el SHA inmutable candidato a Production 10.0.1.

No se debe fusionar PR #307 mientras no se cumpla todo lo siguiente sobre ese SHA exacto:

1. `browser-interaction-e2e` SUCCESS;
2. `protected-preview-live` SUCCESS;
3. Vercel Preview READY;
4. `/api/build` devuelve `version=10.0.1` y el mismo SHA exacto;
5. no hay 5xx atribuibles al candidato;
6. PR #307 sigue sin incluir PRE-005 ni cambios posteriores de la auditoría.

Tras el merge deben comprobarse además:

- nuevo `main`;
- deployment Production READY;
- `/api/build` de Production = 10.0.1 y commit nuevo de `main`;
- autenticación y superficies principales operativas;
- ausencia de 5xx en el deployment Production.

Sólo después de esas comprobaciones puede declararse Financial App 10.0.1 publicada en Production.
