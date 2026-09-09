# PRE-005 · Protección same-origin de mutaciones

Fecha de cierre técnico: 2026-09-09

## Objetivo

Cerrar PRE-005 mediante una política única y fail-closed para peticiones mutantes originadas desde navegador, sin duplicar lógica en cada endpoint y sin interferir con GET, callbacks OAuth ni llamadas legítimas servidor-a-servidor.

## Alcance

PRE-005 cubre el paquete definido en el roadmap G:

- same-origin para mutaciones;
- Fetch Metadata como señal defensiva adicional;
- aplicación antes de autenticación y persistencia;
- conservación del comportamiento actual de GET/OAuth y de clientes servidor-a-servidor sin metadata de navegador.

CSP pertenece al paquete siguiente de G y no se mezcla con este cierre.

## Test-first rojo

SHA rojo: `4ad723841c708496e91bd956c9011b0b68123b3f`

Run: `34322722486`

Se introdujeron primero pruebas que exigían:

1. rechazar una mutación autenticada con `Origin: https://evil.example` y `Sec-Fetch-Site: cross-site` antes de consultar autenticación o persistencia;
2. conservar una mutación autenticada same-origin;
3. proteger también una mutación pública como `/api/auth/login`;
4. no bloquear callbacks GET de OAuth ni llamadas servidor-a-servidor sin cabeceras de navegador.

Resultado antes de la corrección:

- la petición cross-site autenticada llegaba a middleware con respuesta 200 en desktop y móvil;
- el login cross-site también devolvía 200 en desktop y móvil;
- los cuatro fallos PRE-005 demostraron el hueco real;
- apareció además un flaky previo e independiente de Movimientos en desktop;
- resumen del run rojo: **378 passed / 79 skipped / 5 failed**.

## Implementación

### Política central

Se añade `src/infrastructure/auth/mutation-origin.ts` como única fuente de verdad de la política de origen.

Reglas:

- GET, HEAD y OPTIONS no son mutaciones y no se bloquean por esta política;
- una mutación con `Sec-Fetch-Site: cross-site` se rechaza;
- cuando `Origin` está presente debe coincidir exactamente con el origin del request;
- un Origin inválido u opaco falla cerrado;
- `same-site` sin Origin no se acepta, porque un subdominio hermano no equivale a same-origin;
- la ausencia de cabeceras de navegador no se interpreta como ataque: se conserva para clientes autenticados server-to-server/CLI.

### Aplicación temprana

`proxy.ts` ejecuta la política para cualquier ruta `/api/*` mutante antes de:

- bypass de rutas públicas de autenticación;
- validación de sesión;
- refresh de sesión;
- llamadas a Supabase;
- cualquier persistencia de la ruta final.

El rechazo es estable:

- HTTP 403;
- `{ "error": "cross_site_mutation_rejected", "code": null }`;
- `Cache-Control: no-store`;
- `X-Content-Type-Options: nosniff`;
- `X-Robots-Tag: noindex`.

## Compatibilidad preservada

Las pruebas verifican que siguen funcionando:

- autenticación allowlisted;
- refresh y rotación de cookies;
- revocación de usuarios ya no autorizados;
- build metadata pública;
- Preview protection existente;
- redirect seguro post-login;
- mutaciones same-origin;
- callback OAuth GET incluso con `Sec-Fetch-Site: cross-site`;
- llamadas mutantes servidor-a-servidor sin `Origin` ni Fetch Metadata.

No se modifica la fuente bancaria, que permanece estrictamente read-only.

## Gate local previo al sello

SHA probado: `33c460faaab01ffe529662cf475dfb6013b55911`

Run: `34322919944`

Resultado:

- build: OK;
- TypeScript: OK;
- Playwright desktop + móvil: **383 passed / 83 skipped / 0 failed**;
- los cuatro contratos PRE-005 pasan en desktop y móvil;
- Movimientos, incluido el caso que flakeó en el run rojo, vuelve a verde;
- PRE-006 y PRE-007 permanecen verdes;
- OCR y OAuth mantienen sus contratos existentes.

## Prueba viva protegida

`tests/e2e/mutation-origin-live.spec.ts` se ejecuta sólo sobre Preview protegido y comprueba:

1. `POST /api/auth/login` con Origin externo + `cross-site` devuelve 403 con el contrato PRE-005 exacto;
2. el mismo endpoint con Origin exacto del Preview + `same-origin` atraviesa el middleware y alcanza la ruta real, que con credenciales vacías devuelve 401 `invalid_credentials`.

Esto diferencia un rechazo real de middleware de un falso positivo producido por la propia ruta.

## Criterio de cierre final

Este documento se sella con `[vercel-preview]` para producir un SHA inmutable.

PRE-005 sólo se marcará cerrado cuando, sobre ese SHA exacto:

- Vercel Preview esté READY;
- `/api/build` confirme el mismo SHA;
- `browser-interaction-e2e` termine verde;
- `protected-preview-live` termine verde;
- las dos pruebas live PRE-005 terminen verdes;
- no aparezcan 5xx atribuibles al cambio.

Hasta entonces el bloque G permanece formalmente al 50%.
