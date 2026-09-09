# PRE-004 · Procedencia inmutable de release

Fecha de sello técnico: 2026-09-09

## Objetivo

Cerrar PRE-004 sin inventar procedencia histórica ni crear tags retroactivos. Una release comercial debe poder demostrar de forma fail-closed que la versión, el commit, el deployment y la identidad criptográfica del artefacto corresponden al mismo runtime desplegado.

## Test-first rojo

Commit: `a3e57eefb6ff12031700314d81b960930bd9cedf`

Run: `34361207582`

Resultado:

- build y TypeScript verdes;
- 393 passed / 86 skipped / 1 failed;
- el único fallo fue PRE-004 por ausencia de un manifest/contrato de procedencia verificable.

No se creó ni movió ningún tag existente y no se retroetiquetó `v10.0.1`.

## Implementación

### Runtime

`src/core/release-provenance.ts` genera una identidad SHA-256 determinista para el deployment a partir de:

- nombre de aplicación;
- versión canónica de `package.json`;
- commit SHA completo;
- `VERCEL_DEPLOYMENT_ID`;
- entorno Vercel.

`/api/build` expone:

- `releaseSchemaVersion`;
- `releaseTag`;
- `releaseId`;
- `artifactAlgorithm`;
- `artifactScope`;
- `artifactDigest`;
- `releaseDeployable`.

Sólo un SHA de 40 hex, un deployment `dpl_...` y entorno `preview` o `production` pueden resultar desplegables.

### Manifest post-deployment

`scripts/create-release-manifest.mjs` consume la respuesta real de `/api/build` y falla cerrado ante discrepancias de:

- versión/tag;
- SHA;
- deployment;
- entorno;
- digest/algoritmo/scope;
- releaseId.

El manifest se genera después del deployment para evitar una identidad autorreferente imposible de mantener dentro del propio commit.

### Gate protegido

`.github/workflows/rebuild-preview-e2e.yml` genera el manifest desde el Preview exacto antes de ejecutar los E2E live y lo conserva como artefacto de evidencia durante 30 días.

### Publicación comercial

`.github/workflows/publish-verified-release.yml` queda como workflow manual y fail-closed. Sólo puede publicar desde `main`, exige una URL HTTPS de Production, valida el runtime real y se niega a reutilizar o mover un tag existente. No se ejecuta durante esta auditoría.

## Regresión local previa al sello

Candidato: `d793fc286d8dc8c7528ff7ba69a3370f74de6f34`

Run: `34364993724`

Resultado:

- Next.js 16.3.4 build: OK;
- TypeScript: OK;
- Playwright desktop+móvil: **394 passed / 86 skipped / 0 failed**;
- PRE-004 positiva: verde;
- SHA manipulado: rechazado;
- mismo deployment: identidad estable;
- deployment diferente: digest diferente.

## Criterio de cierre final

Este commit se crea con `[vercel-preview]` y no cambia código funcional respecto al candidato verde anterior.

PRE-004 sólo se considerará cerrado si el SHA de este sello obtiene simultáneamente:

1. Vercel Preview `READY` asociado al mismo SHA exacto;
2. `/api/build` con ese SHA y un `deploymentId` real;
3. manifest generado y validado antes del E2E live;
4. artefacto `pre004-release-manifest` conservado por Actions;
5. regresión local verde;
6. `protected-preview-live` verde;
7. ninguna modificación de `main`, Production o tags durante la validación.
