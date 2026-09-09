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

## Gate live protegido ya demostrado

SHA live previo: `5bef282956b116b7234b4f19f27e913b596e12f9`

Run: `34325795510`

El job `protected-preview-live` terminó **SUCCESS** sobre un Preview cuyo SHA desplegado coincidía exactamente con ese commit.

Resultado live:

- **436 passed / 30 skipped / 0 failed**;
- las pruebas PRE-005 de rechazo cross-site y conservación same-origin pasan en desktop y móvil;
- `/api/build` y el gate de identidad confirmaron el SHA exacto;
- no se observaron fallos 5xx atribuibles a PRE-005.

El job local de ese mismo run quedó rojo por una carrera previa e independiente del test `Movimientos filtra sin categoría por el valor efectivo`. El fallo no afectó a la aplicación ni a PRE-005, pero se mantuvo el paquete abierto hasta eliminar ese falso rojo de forma determinista.

## Estabilización determinista del gate de Movimientos

SHA de estabilización: `b6c4737d776e23c914280f893d3c1709eb1cc596`

Run: `34326798798`

La única modificación fue en la prueba E2E: antes de seleccionar `__uncategorized__`, el test espera ahora a que el listado inicial muestre `1 de 2`, evitando que el efecto de inicialización de React pueda restaurar el filtro durante la interacción.

No se modificó lógica funcional de Movimientos, endpoints, motores financieros ni persistencia.

Resultado definitivo local:

- build: OK;
- TypeScript: OK;
- Playwright desktop + móvil: **383 passed / 83 skipped / 0 failed**;
- el test de Movimientos problemático pasa en desktop y móvil;
- los cuatro contratos PRE-005 pasan en desktop y móvil;
- PRE-006 y PRE-007 permanecen verdes;
- OCR, OAuth y fuente bancaria read-only mantienen sus contratos.

## Sello final único

Este commit se crea con `[vercel-preview]` sobre el contenido funcional ya validado y la estabilización determinista del test.

PRE-005 sólo se marcará cerrado cuando, sobre el SHA producido por este mismo sello:

- Vercel Preview esté READY;
- `/api/build` confirme exactamente ese SHA;
- `browser-interaction-e2e` termine verde;
- `protected-preview-live` termine verde;
- las dos pruebas live PRE-005 terminen verdes;
- no aparezcan 5xx atribuibles al cambio.

Hasta ese momento el bloque G permanece formalmente al 50%. Si ambos jobs cierran en verde sobre este mismo SHA, PRE-005 se considera completado al 100% y G pasa al 75%, quedando CSP como único paquete pendiente del bloque G.
