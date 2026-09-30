# CR-008 · replay autenticado real

Este gate existe para cerrar la única evidencia que los E2E protegidos anteriores no pueden demostrar por sí solos: ejecutar el documento canónico de CR-008 dentro de una sesión interna legítima de Financial App.

## Qué demuestra

1. La URL objetivo es una Preview HTTPS de Vercel y `/api/build` devuelve exactamente el SHA esperado.
2. Cruzar la protección de Vercel no concede acceso interno: antes del login, `/api/documents` debe responder 401 o 403.
3. El acceso interno se obtiene únicamente mediante `POST /api/auth/login` con una cuenta QA real de Supabase que Financial App reconoce como autorizada.
4. La cookie de sesión emitida por la aplicación es la que se reutiliza para leer el documento y ejecutar `GET /api/documents/ocr`.
5. El documento persistido se lee antes y después; cualquier cambio provocado por el replay hace fallar el gate.
6. La respuesta OCR debe conservar `bankSource=read_only`, `financialWrites=false` y `requiresHumanReview=true`.
7. La evidencia subida a GitHub contiene sólo métricas sanitizadas. No guarda texto OCR, bytes del documento, email, contraseña, cookies ni tokens.
8. La sesión se cierra al terminar y los archivos temporales con credenciales/cookies se destruyen aunque falle el job.

## Secretos necesarios

El workflow no crea usuarios ni inserta filas directamente en `auth.users`. Tampoco incorpora credenciales al repositorio. Para ejecutar el replay real deben existir como GitHub Actions secrets:

- `FINANCIAL_APP_QA_EMAIL`: email de una cuenta QA creada por el flujo normal de Supabase Auth y autorizada en Financial App.
- `FINANCIAL_APP_QA_PASSWORD`: contraseña de esa identidad QA.
- `FINANCIAL_APP_CR008_DOCUMENT_ID`: UUID del documento privado canónico que ya existe en el workspace autorizado.

`VERCEL_AUTOMATION_BYPASS_SECRET` es opcional y sólo cruza la protección de hosting. Si no existe, el workflow usa un token GitHub OIDC efímero. Ninguno de esos mecanismos sustituye al login interno.

## Ejecución

El job de contrato se ejecuta automáticamente cuando cambia este gate. El replay con datos reales sólo puede arrancarse mediante `workflow_dispatch`, indicando la URL de Preview y el SHA exacto que debe estar desplegado. Si falta cualquier secreto, el SHA no coincide, el documento es inaccesible, la sesión no es válida, OCR no devuelve evidencia revisable o se rompe una invariancia de seguridad, el workflow termina en fallo.

## Regla de promoción

Este gate es infraestructura de certificación y no cambia la versión funcional. No autoriza por sí solo a fusionar PR #425 ni a publicar 10.0.46. La secuencia sigue siendo: cerrar primero CR-008/PR #424 con replay autenticado verde; después integrar y versionar correctamente el bloque funcional 10.0.46.
