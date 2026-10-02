# ART-007 · Tipografía efectiva reproducible · Financial App 10.0.60

## Hallazgo revalidado

La auditoría original detectó `Inter` declarada sin `@font-face` ni `next/font`. El estado actual ya no contiene esa falsa promesa: `app/globals.css` usa una pila de sistema explícita.

REL-060 formaliza esa decisión en vez de introducir una webfont innecesaria.

## Contrato canónico

La familia UI de Financial App es:

`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

Reglas:

- `body` debe consumir `var(--font-family-ui)`.
- `button`, `input`, `select` y `textarea` heredan la tipografía efectiva.
- No se declara `Inter` como expectativa implícita.
- No se introduce `next/font`, `@font-face` ni una fuente remota sin cambiar expresamente este contrato y su certificación.
- La estrategia evita una dependencia de red tipográfica y conserva las métricas nativas de cada plataforma de forma deliberada.

## Certificación

`scripts/verify-typography-runtime.mjs` protege el contrato estático y se ejecuta en `postbuild`.

`tests/e2e/typography-runtime-10.0.60.spec.ts` comprueba el render efectivo en 360, 430, 768 y 1280 px:

- token tipográfico system-ui presente;
- ausencia de Inter implícita;
- `body`, `h1` y controles comparten la familia efectiva;
- no aparece overflow horizontal por cambio de métricas.

## Criterio ART-007

**CERRABLE** cuando el gate 10.0.60 pase guard estático, TypeScript, build y la regresión de navegador en todos los breakpoints, junto con los gates transversales de producto.
