# CR-008 · replay autenticado real

Este gate existe para cerrar la única evidencia que los E2E protegidos anteriores no pueden demostrar por sí solos: ejecutar el documento canónico de CR-008 dentro de una sesión interna legítima de Financial App.

## Qué demuestra

1. La URL objetivo es una Preview HTTPS de Vercel y `/api/build` devuelve exactamente el SHA esperado.
2. Cruzar la protección de Vercel no concede acceso interno: antes del login, `/api/documents` debe responder 401 o 403.
3. El acceso interno se obtiene únicamente mediante `POST /api/auth/login` con una cuenta QA real de Supabase que Financial App reconoce como autorizada.
4. La cookie de sesión emitida por la aplicación es la que se reutiliza para leer el documento y ejecutar `GET /api/documents/ocr`.
5. El documento canónico no se introduce como secreto manual: el workflow lo resuelve con una consulta PostgreSQL forzada a `default_transaction_read_only=on`, dentro del workspace Personal, exigiendo una única coincidencia de la huella persistida del JPG real (`size_bytes=2258072`, `mime_type=image/jpeg`). El UUID resultante se enmascara y no se imprime.
6. El documento persistido se lee antes y después; cualquier cambio provocado por el replay hace fallar el gate.
7. La respuesta OCR debe conservar `bankSource=read_only`, `financialWrites=false` y `requiresHumanReview=true`.
8. La evidencia subida a GitHub contiene sólo métricas sanitizadas. No guarda texto OCR, bytes del documento, email, contraseña, cookies, tokens ni UUID del documento.
9. La sesión se cierra al terminar y los archivos temporales con credenciales/cookies se destruyen aunque falle el job.

## Secretos necesarios

El workflow no crea usuarios ni inserta, actualiza o elimina filas directamente en `auth.users`. Tampoco incorpora credenciales al repositorio.

Para ejecutar el replay real sólo deben existir como GitHub Actions secrets de identidad QA:

- `FINANCIAL_APP_QA_EMAIL`: email de una cuenta QA creada por el flujo normal de Supabase Auth y autorizada en Financial App.
- `FINANCIAL_APP_QA_PASSWORD`: contraseña de esa identidad QA.

El gate reutiliza `FINANCIAL_APP_DB_PASSWORD`, secreto operativo ya existente y usado por el postflight oficial de Producción, únicamente para resolver el documento canónico mediante lectura PostgreSQL. `FINANCIAL_APP_CR008_DOCUMENT_ID` deja de ser necesario.

`VERCEL_AUTOMATION_BYPASS_SECRET` es opcional y sólo cruza la protección de hosting. Si no existe, el workflow usa un token GitHub OIDC efímero. Ninguno de esos mecanismos sustituye al login interno.

## Evidencia de capacidad de Producción

El probe read-only de 30/09/2026 confirmó sobre el backend efectivo `btzukbfesxdratqnxuoj`:

- registro de Supabase Auth habilitado;
- confirmación de email obligatoria (`mailer_autoconfirm=false`);
- 1 usuario Auth total y 0 identidades QA/test;
- 1 usuario autorizado activo;
- 1 membresía activa del workspace Personal;
- 2 documentos persistidos;
- una única coincidencia Storage de 2.258.072 bytes para el ticket canónico.

El probe ejecuta PostgreSQL con `default_transaction_read_only=on` y termina en `ROLLBACK`; no modifica Auth, datos financieros, documentos ni membresías.

## Ejecución pre-merge

GitHub sólo entrega eventos `workflow_dispatch` cuando el workflow existe en la rama por defecto. Para no tener que fusionar este gate antes de cerrar CR-008, la rama técnica admite un segundo disparador explícito y restringido: un push cuyo mensaje contenga `[cr008-auth-replay]`.

En ese modo el job usa el SHA exacto del push y busca en GitHub Deployments una Preview Vercel `success` asociada a ese mismo SHA. No acepta una Preview aproximada ni una URL de otro commit. Si el proyecto necesita el marcador habitual para construir Preview, el commit de ejecución debe incluir también `[vercel-preview]`. Si no aparece una Preview exacta, el gate falla cerrado.

No se debe usar el marcador mientras falten las credenciales QA legítimas: el job fallaría correctamente antes del login. El marcador no contiene credenciales ni identificadores privados.

## Ejecución tras integrar el gate

Cuando el workflow exista en la rama por defecto, `workflow_dispatch` seguirá disponible. En ese modo se introducen la URL de Preview y el SHA completo esperado; el gate vuelve a comprobar ambos antes de iniciar sesión.

En cualquiera de los dos modos, si falta una credencial QA, el SHA no coincide, la huella del documento deja de ser única, el documento es inaccesible, la sesión no es válida, OCR no devuelve evidencia revisable o se rompe una invariancia de seguridad, el workflow termina en fallo.

## Regla de promoción

Este gate es infraestructura de certificación y no cambia la versión funcional. No autoriza por sí solo a fusionar PR #425 ni a publicar 10.0.46. La secuencia sigue siendo: cerrar primero CR-008/PR #424 con replay autenticado verde; después integrar y versionar correctamente el bloque funcional 10.0.46.
