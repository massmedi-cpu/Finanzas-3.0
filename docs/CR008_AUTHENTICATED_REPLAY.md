# CR-008 · replay autenticado real

Este gate existe para cerrar la única evidencia que los E2E protegidos anteriores no pueden demostrar por sí solos: ejecutar el documento canónico de CR-008 dentro de una sesión interna legítima de Financial App.

## Qué demuestra

1. La URL objetivo es una Preview HTTPS de Vercel y `/api/build` devuelve exactamente el SHA esperado.
2. Cruzar la protección de Vercel no concede acceso interno: antes del login, `/api/documents` debe responder 401 o 403.
3. El acceso interno se obtiene únicamente mediante `POST /api/auth/login` con una cuenta QA real de Supabase Auth.
4. La identidad QA debe ser el alias Gmail dedicado `+financialapp-cr008-qa`, existir previamente en `auth.users` y estar sin autorización ni membresías activas antes de empezar. Si no se cumplen esas condiciones el gate falla cerrado.
5. El propio workflow activa de forma temporal la fila de `financial_app.authorized_users` y una membresía `member` del workspace Personal. No concede rol `owner`.
6. La cookie de sesión emitida por Financial App es la que se reutiliza para leer el documento y ejecutar `GET /api/documents/ocr`.
7. El documento canónico no se introduce como secreto manual: el workflow lo resuelve con PostgreSQL forzado a `default_transaction_read_only=on`, dentro del workspace Personal, exigiendo una única coincidencia de la huella persistida del JPG real (`size_bytes=2258072`, `mime_type=image/jpeg`). El UUID resultante se enmascara y no se imprime.
8. El documento persistido se lee antes y después; cualquier cambio provocado por el replay hace fallar el gate.
9. La respuesta OCR debe conservar `bankSource=read_only`, `financialWrites=false` y `requiresHumanReview=true`.
10. La evidencia subida a GitHub contiene sólo métricas sanitizadas. No guarda texto OCR, bytes del documento, email, contraseña, cookies, tokens ni UUID del documento.
11. La sesión se cierra al terminar y los archivos temporales con credenciales/cookies se destruyen aunque falle el job.
12. En un paso `always()` posterior, la allowlist QA se desactiva y su membresía se deja `active=false` e `is_default=false`; después se comprueba por lectura que no quede ninguna autorización ni membresía QA activa.

## Qué debe existir antes de ejecutar

El workflow no crea usuarios, no inserta, actualiza ni elimina filas directamente en `auth.users` y no cambia la configuración de Supabase Auth. La identidad QA debe crearse previamente por un flujo oficial de Supabase Auth/Dashboard.

Para evitar que una credencial equivocada afecte al usuario principal, el gate sólo admite el alias dedicado de Gmail con sufijo `+financialapp-cr008-qa@gmail.com`. La cuenta debe estar confirmada y debe empezar sin filas activas de allowlist ni de workspace.

Sólo hacen falta dos GitHub Actions secrets de identidad QA:

- `FINANCIAL_APP_QA_EMAIL`: alias dedicado confirmado.
- `FINANCIAL_APP_QA_PASSWORD`: contraseña de esa identidad QA.

El gate reutiliza `FINANCIAL_APP_DB_PASSWORD`, secreto operativo ya existente y usado por el postflight oficial de Producción, para: (a) resolver de forma read-only la identidad y el ticket canónico; (b) abrir una ventana temporal de autorización de la identidad QA; y (c) revocarla y verificar la revocación al terminar. `FINANCIAL_APP_CR008_DOCUMENT_ID` deja de ser necesario.

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

El probe ejecutó PostgreSQL con `default_transaction_read_only=on` y `ROLLBACK`; no modificó Auth, datos financieros, documentos ni membresías.

## Ejecución pre-merge

GitHub sólo entrega eventos `workflow_dispatch` cuando el workflow existe en la rama por defecto. Para no tener que fusionar este gate antes de cerrar CR-008, la rama técnica admite un segundo disparador explícito y restringido: un push cuyo mensaje contenga `[cr008-auth-replay]`.

En ese modo el job usa el SHA exacto del push y busca en GitHub Deployments una Preview Vercel `success` asociada a ese mismo SHA. No acepta una Preview aproximada ni una URL de otro commit. Si el proyecto necesita el marcador habitual para construir Preview, el commit de ejecución debe incluir también `[vercel-preview]`. Si no aparece una Preview exacta, el gate falla cerrado.

No se debe usar el marcador mientras falten las credenciales QA legítimas: el job fallaría correctamente antes de activar ningún acceso. El marcador no contiene credenciales ni identificadores privados.

## Ejecución tras integrar el gate

Cuando el workflow exista en la rama por defecto, `workflow_dispatch` seguirá disponible. En ese modo se introducen la URL de Preview y el SHA completo esperado; el gate vuelve a comprobar ambos antes de iniciar sesión.

En cualquiera de los dos modos, si falta una credencial QA, el email no corresponde al alias dedicado, la cuenta no existe o ya tenía acceso activo, el SHA no coincide, la huella del documento deja de ser única, el documento es inaccesible, la sesión no es válida, OCR no devuelve evidencia revisable o se rompe una invariancia de seguridad, el workflow termina en fallo. Si la autorización temporal llegó a activarse, el paso de revocación se ejecuta incluso cuando el replay falla.

## Regla de promoción

Este gate es infraestructura de certificación y no cambia la versión funcional. No autoriza por sí solo a fusionar PR #425 ni a publicar 10.0.46. La secuencia sigue siendo: cerrar primero CR-008/PR #424 con replay autenticado verde; después integrar y versionar correctamente el bloque funcional 10.0.46.
