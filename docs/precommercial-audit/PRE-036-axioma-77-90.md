# PRE-036 · Axioma §§77–90

Fecha: 2026-10-01
Base auditada: Financial App 10.0.51 · `main` `61c4fc2e65c1d0285d092aeb63183be149fadbe9`

## Hallazgo real

La aplicación ya contaba con navegación responsive, safe areas, reduced motion, estados `aria-live`, skeletons y gates de navegación/rendimiento. Sin embargo, el cumplimiento PWA de los §§78 y 87 era incompleto: el service worker solo hacía `fetch()` directo, sin Background Sync, sin revalidación al recuperar red y sin una representación explícita de la última información segura durante la desconexión.

## Corrección

- Estado online/offline global accesible y visible.
- Background Sync con tag `financial-app-safe-refresh-v1`.
- El service worker solo revalida `GET /api/analysis/source-freshness`.
- No se cachean respuestas bancarias en Cache Storage y no se reintentan POST/PUT/PATCH/DELETE.
- Snapshot local limitado a metadatos de confianza de la fuente, sin importes, conceptos, cuentas, IBAN ni filas bancarias.
- Al recuperar conexión se invalida el caché efímero y se revalida el estado real.
- E2E específico para desconexión, snapshot seguro, viewport 320 px y targets táctiles de 44 px.
- Gate CI `PRE-036 Axioma 77-90` con verificador estático, TypeScript, build y Playwright desktop/mobile.

## Invariantes

La fuente bancaria continúa siendo solo lectura. PRE-036 no introduce escrituras financieras, no habilita replay de mutaciones y no persiste datos bancarios de detalle en el service worker.

## Alcance

PRE-036 cierra específicamente la brecha comprobada dentro de §§77–90. Los §§91–108 quedan para el siguiente bloque de auditoría visual/sistemática y no se dan por certificados aquí.
