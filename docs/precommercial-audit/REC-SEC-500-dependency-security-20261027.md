# REC-SEC-500 · Seguridad de dependencias · 27/10/2026

## Hallazgo y alcance

La candidata 10.0.104 y el `package.json` del commit de producción 10.0.103
`6dad59c6c2db3575618a7c91c49c3060a93bbba1` fijaban Next.js 16.3.8. El
`npm audit` de la candidata informó de 1 incidencia crítica y 5 altas. Incluía
avisos de Next.js y `sharp`, más dependencias transitivas. Una coincidencia de
versiones no demuestra que Financial App sea explotable o esté comprometida.
La producción **no está parcheada por este cambio de candidata**.

Avisos originales de Next.js: [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw),
[GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r)
y [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr).
La búsqueda del código propio no encontró `next/image`, `use cache` ni `use server`;
esto no constituye una prueba exhaustiva de exposición del despliegue.

## Cambio acumulativo en candidata

- Next.js queda fijado a **16.4.3**, versión posterior a la corrección 16.4.1
  indicada en los avisos; `sharp` se resuelve a **0.35.5**.
- `source-map-js` queda resuelto a **1.2.2** dentro del rango permitido de
  PostCSS.
- `@vercel/oidc` permanece en **3.8.5**. Su `@vercel/cli-config` fijaba Zod
  4.1.11; se aplica un override acotado a esa dependencia para usar Zod
  **4.6.7**. El override altera una dependencia exacta del proveedor y debe
  revisarse cuando este publique una alternativa corregida.
- `npm audit` tras el cambio informó **0 vulnerabilidades conocidas** en la
  fecha de ejecución; este resultado no garantiza ausencia de vulnerabilidades.
- `tests/unit/oidc-config-compat.test.mjs` comprueba parseo y persistencia de
  configuraciones ficticias, rechazo de entradas inválidas y lectura de un token
  sintético fresco sin red. No prueba una sesión ni identidad real en Vercel.
- La prueba aislada de PostgreSQL del preflight AP8 usa PGlite fijado como
  dependencia de desarrollo; no se introduce una dependencia productiva nueva.

## Límites

El build y CI deben certificarse sobre el commit exacto resultante. El cambio no
es un despliegue, no autoriza migraciones ni cambia el NO-GO. Antes de publicar
se requiere todavía QA real con la sesión propietaria, incluido OIDC y gateway,
además de las demás puertas financieras y de respaldo de la release. El
control de Next.js disponible en scripts de release 10.0.71 es histórico y está
ligado a la versión de aplicación de ese lanzamiento; no certifica 10.0.104.
