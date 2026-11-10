# REC-AUTH-627/628 · límites del proveedor de autenticación

Fecha: 10/11/2026. Candidata 10.0.104, PR #619 en borrador. Producción 10.0.103 fuera del alcance de este cambio.

## Hallazgos reproducidos

Las peticiones de autenticación usaban la política de redirecciones predeterminada de `fetch`. Una respuesta HTTP 307/308 podía reproducir el cuerpo que contiene la contraseña o el refresh token en otro destino. Cuatro pruebas con un servidor HTTP exclusivamente local reprodujeron el reenvío antes del cambio. No es evidencia de una redirección ni de exposición real en Supabase.

El cliente también analizaba las respuestas del proveedor con `response.json()` sin limitar el cuerpo. Una respuesta de autorización de más de 70 KiB se aceptaba como `true`. La regresión se reprodujo antes de corregirla.

## Corrección

- `supabaseFetch` rechaza cualquier redirección mediante `redirect: "error"`, incluido login, renovación, autorización y revocación.
- Login, renovación y autorización limitan la lectura real a 64 KiB, independientemente de `Content-Length`. Se reutiliza el lector limitado existente y se cancela el flujo excesivo.
- Respuestas excesivas, incompletas o inválidas fallan cerradas con indisponibilidad genérica. No se registran cuerpos, contraseñas ni tokens.
- El flujo de CI de autenticación incluye las ocho nuevas pruebas, usa el HEAD exacto de la PR, fija las acciones a hashes ya empleados en la matriz validada y desactiva la persistencia de credenciales de checkout.

No cambian contraseñas, permisos, allowlist, cookies, SQL, gateway ni proveedor. No se añaden servicios o costes.

## Validación local

- Antes del cambio: cinco regresiones reproducidas y un control de login ordinario correcto.
- Después: 28/28 pruebas de autenticación superadas, incluidas las ocho nuevas.
- Suite ampliada sobre build optimizada: 36 pruebas superadas. Otras 19 pruebas de navegador no pudieron iniciarse por `socket() failed: Operation not permitted` de Chromium local; no se consideran verificadas ni fallos funcionales demostrados. Su comprobación corresponde a CI.
- Tipado, lint estático de 298 archivos, build y comprobaciones postbuild correctos. El gate de runtime Vercel se omite explícitamente fuera de Vercel y no queda acreditado por el build local.
- `npm audit --json`: cero vulnerabilidades conocidas de dependencias de producción o desarrollo en la consulta de esta fecha.
- Diff revisado, sin credenciales reales en las pruebas. Todos los identificadores y secretos de los fixtures son sintéticos.

## Contexto del aviso de Notion

Se revisó el aviso recibido por el propietario el 10/11, autenticado por Gmail con DKIM/SPF/DMARC correctos, y el [boletín oficial de Fireworks actualizado el 09/11](https://fireworks.ai/security/bulletins/october-2026-security-incident-update).

El aviso de Notion delimita el posible impacto a transcripciones de Notion AI. No acredita una intrusión en Financial App ni en las páginas de documentación. El análisis por patrones de la página maestra no detectó claves privadas, PAT de GitHub, claves secretas de Supabase, claves Google, JWT ni URL PostgreSQL con contraseña. Esto no verifica todas las formas de secreto ni las conversaciones afectadas. No se recuperaron las transcripciones de Notion AI y no se puede descartar que se hubieran pegado credenciales en ellas.

Los registros de continuidad deben contener resultados técnicos y enlaces; nunca claves, tokens de sesión, cuerpos de autenticación o filas bancarias completas. Una eventual credencial confirmada en las transcripciones requerirá rotación por su canal seguro, sin copiarla al registro.

## Comprobaciones del entorno, solo lectura

La allowlist viva contiene exactamente una cuenta activa, correspondiente al propietario solicitado en esta sesión, con correo verificado. No se modificó la allowlist. Supabase Advisor mantiene cuatro avisos INFO en tablas internas con RLS sin políticas y un WARN por protección de contraseñas filtradas desactivada. Según la [documentación de Supabase](https://supabase.com/docs/guides/auth/password-security), esa protección exige Pro o superior; no se activa ningún plan de pago.

## Continuidad y límites

El HEAD anterior `8fc4e3564dc04a670eb5672bc726f2ce2cd1e668` sí terminó 73/73 workflows correctos, con FA-STORE-004 superada en escritorio y móvil. Este resultado no certifica el nuevo commit.

Mantener PR #619 abierta y en borrador. Pendientes CI del nuevo SHA, preview exacta, sesión auténtica del propietario y QA, respaldo reciente al corte, ensayo de reversión completo y autorización separada de las altas bancarias. No fusionar, publicar ni importar por este cambio. El checklist conserva 10/18 y NO-GO.
