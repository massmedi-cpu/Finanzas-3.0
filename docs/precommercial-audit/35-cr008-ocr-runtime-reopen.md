# 35 · CR-008 reabierta — CR008-OCR-001 · Financial App Reader

Fecha: 2026-09-12 (Europe/Madrid)

## Motivo de reapertura

El propietario ha detectado en uso real que el OCR desde Google Drive no puede ejecutarse porque falta la credencial gestionada de `Financial App Reader` en el entorno de ejecución.

La implementación exige la variable privada `GOOGLE_SERVICE_ACCOUNT_JSON` y valida que pertenezca exactamente a:

`financial-app-reader@financial-app-507709.iam.gserviceaccount.com`

El cierre anterior de CR-008 sobre `e094ffb49ddcff6cf113af06a7c1032a690bac96` queda degradado como evidencia incompleta para OCR. No se considera válido un cierre al 100 % mientras CR008-OCR-001 permanezca abierto.

## Causa raíz de la falsa confianza

Se identifican dos huecos de cobertura:

1. `tests/e2e/google-service-account.spec.ts` construye una clave RSA de prueba e inyecta temporalmente `GOOGLE_SERVICE_ACCOUNT_JSON` en el proceso de test. Demuestra el contrato criptográfico y de parsing, pero no demuestra que Vercel tenga la credencial real.
2. `tests/e2e/documents-drive-ocr-live.spec.ts` requiere `VERCEL_PREVIEW_URL`, por lo que se omite en la suite local. El job `protected-preview-live` del workflow de rebuild no incluía esa prueba. En consecuencia, ninguna gate obligatoria validaba la disponibilidad real de Financial App Reader en el Preview desplegado.

La prueba live de OCR tampoco debe ejecutarse saltándose tenancy: el endpoint de documentos exige un contexto de workspace válido. Un `403 workspace_context_required` sin sesión no constituye ni PASS ni fallo del motor OCR.

## Corrección de cobertura

Se incorpora un probe operacional exclusivo de Preview:

`GET /api/health/document-reader`

El probe no devuelve secretos y sólo está disponible cuando `VERCEL_ENV=preview`. Valida de forma acumulativa:

- presencia y parsing de `GOOGLE_SERVICE_ACCOUNT_JSON`;
- identidad exacta de Financial App Reader;
- obtención real de token OAuth de Google con scope de Drive de solo lectura;
- lectura real en Google Drive del archivo oficial conocido por la aplicación.

Se añade además el workflow independiente `CR-008 Managed Reader Preview Gate`, que:

- descubre el deployment Vercel asociado al SHA exacto;
- comprueba `/api/build` y rechaza cualquier SHA distinto;
- consulta el probe protegido;
- falla cerrado si la credencial falta, es inválida, Google rechaza la autenticación o Drive no es legible.

Este gate no necesita un segundo deployment y no modifica Production.

## Límites de la corrección

El nuevo gate demuestra la disponibilidad real del lector gestionado y acceso Drive en el runtime de Preview. No sustituye por sí solo una prueba end-to-end de un documento OCR dentro de un workspace autenticado.

La cobertura local existente continúa validando parsing, reconocimiento, geometría y contratos OCR. El cierre definitivo de CR008-OCR-001 requiere además comprobar el flujo OCR desde Drive con un contexto de workspace válido o una prueba segura equivalente que no cree un bypass de tenancy.

## Criterios de cierre

CR008-OCR-001 sólo puede cerrarse cuando:

1. `GOOGLE_SERVICE_ACCOUNT_JSON` esté configurada en el Preview auditado y corresponda a Financial App Reader.
2. `CR-008 Managed Reader Preview Gate` termine en SUCCESS sobre el SHA exacto.
3. El flujo Drive → OCR se valide con contexto de workspace válido, sin credenciales bancarias ni datos sensibles de prueba.
4. Los gates generales de regresión del mismo SHA continúen verdes.
5. El diagrama canónico de Google Sheets se actualice con la evidencia exacta.

## Production

`main` y Production permanecen intactos. Esta reapertura no autoriza promoción ni merge de PR #328.

## Beta humana

Las comprobaciones humanas continúan formalmente OMITIDAS por decisión del propietario. CR008-OCR-001 es un defecto técnico de runtime y no reactiva la beta humana.
