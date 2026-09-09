# PRE-006 · Validación de contenido documental real

Fecha de cierre técnico: 2026-09-09

## Objetivo

Cerrar el hallazgo PRE-006 sin alterar el motor OCR ni introducir una segunda fuente de verdad: ningún PDF o imagen puede considerarse documento válido únicamente porque su nombre, MIME declarado o metadata de Storage/Drive indiquen un tipo permitido.

La regla de cierre es fail-closed: el contenido real debe corresponder con el MIME permitido antes de que el documento sea registrado como válido.

## Alcance

Se protegen las dos fronteras documentales actuales:

1. Subida privada a Supabase Storage mediante `upload_sign` + `upload_finalize`.
2. Documentos procedentes de Google Drive mediante `drive_batch` y lectura OCR posterior.

No se modifica:

- la fuente bancaria, que continúa estrictamente en solo lectura;
- el algoritmo OCR ni su reconstrucción geométrica;
- el modelo financiero;
- el esquema PostgreSQL;
- `main` ni el frontend de Production.

## Test-first rojo

SHA rojo: `937b28c52943dbf02eb1569a7f3045a6c236942e`

Run: `34314542517`

Se añadió primero el test `PRE-006 Drive downloader rejects forged PDF metadata when the real bytes are not a PDF`.

Entrada maliciosa controlada:

- nombre: `factura-falsa.pdf`;
- MIME de metadata: `application/pdf`;
- MIME HTTP: `application/pdf`;
- bytes reales: comienzan por `MZ`, por lo que no son PDF.

Resultado antes de la corrección:

- build y TypeScript correctos;
- el downloader resolvía la promesa y devolvía los bytes falsos;
- el test esperaba rechazo;
- fallo reproducido tanto en desktop como en móvil;
- resumen del run rojo: 369 passed / 77 skipped / 2 failed, siendo los dos fallos el mismo nuevo escenario PRE-006 en desktop y móvil.

Esto demuestra que el defecto existía antes de la implementación.

## Implementación

### Detector canónico

Se añade `src/domain/document-content-signature.ts` como única fuente de verdad para las firmas soportadas:

- PDF: `%PDF-`;
- JPEG: `FF D8 FF`;
- PNG: `89 50 4E 47 0D 0A 1A 0A`;
- WebP: `RIFF` y `WEBP` en sus posiciones canónicas.

El detector rechaza contenido vacío, truncado, MIME no soportado o firma incompatible.

### Google Drive

`GoogleDriveDocumentDownloader` mantiene sus controles anteriores de ID, permiso read-only, metadata, MIME, tamaño máximo de 15 MB y tamaño descargado. Después de obtener los bytes reales, aplica ahora el detector canónico.

Un contenido incompatible lanza `google_drive_document_content_mismatch` y no llega a OCR ni a persistencia.

`POST /api/documents` endurece además `drive_batch`: valida y descarga cada elemento del lote antes de realizar la única llamada de persistencia. Si cualquier archivo falla, no se registra ningún elemento del lote, evitando escrituras parciales.

La cuenta lectora de Drive conserva exclusivamente los scopes read-only existentes.

### Supabase Storage

`document.upload_finalize` deja de confiar únicamente en `storage.objects.metadata.mimetype` y `metadata.size`.

Antes de `financial_app.register_document`:

1. localiza el objeto privado;
2. descarga sus bytes reales con service role dentro del Edge gateway;
3. verifica tamaño real, límite de 15 MB y coherencia con metadata;
4. verifica la firma real contra el MIME declarado;
5. sólo si todo es válido registra el documento.

Si tamaño o firma son incompatibles:

- responde 409;
- no ejecuta `register_document`;
- elimina el objeto temporal rechazado de Storage.

No se ha añadido estado de cuarentena ni migración, evitando duplicar fuentes de verdad.

## Cobertura específica

`tests/e2e/document-content-signature.spec.ts` cubre:

- PDF, JPEG, PNG y WebP válidos;
- PDF falsificado;
- firmas truncadas;
- WebP con FourCC incorrecto;
- MIME no soportado;
- contenido vacío.

`tests/e2e/google-drive-document-downloader.spec.ts` cubre el escenario rojo ya corregido: metadata PDF + bytes `MZ` produce rechazo.

`tests/e2e/document-upload-content-live.spec.ts` queda reservado al Preview protegido y prueba la frontera real de Storage:

1. firma una subida privada de PDF;
2. sube bytes deliberadamente no-PDF;
3. `upload_finalize` debe devolver 409 `document_upload_content_mismatch`;
4. la búsqueda por nombre debe devolver cero documentos;
5. un segundo finalize debe devolver 404, demostrando limpieza del objeto rechazado.

## Gate local antes del sello

SHA probado: `b152e27c43664f5e1461c1f8d595a1ae38c0ce7f`

Run: `34315016141`

Resultado:

- build: OK;
- TypeScript: OK;
- Playwright desktop + móvil: **375 passed / 79 skipped / 0 failed**;
- sin retry necesario;
- detector PRE-006: verde en desktop y móvil;
- Drive falso: verde en desktop y móvil;
- regresión OCR existente: verde;
- contratos PRE-007: verdes;
- Movimientos: verde sin el flaky observado en el cierre anterior.

El test de Storage live se omite deliberadamente en el run local porque requiere `VERCEL_PREVIEW_URL` y backend protegido real.

## Sello y criterio de cierre final

Este documento se commitea con `[vercel-preview]` para producir un SHA inmutable de cierre.

PRE-006 sólo puede declararse cerrado cuando, sobre este SHA exacto:

- Vercel Preview esté READY y `/api/build` confirme el mismo commit;
- `financial-app-db-gateway` esté ACTIVE cargando el mismo SHA exacto;
- el gate `browser-interaction-e2e` termine verde;
- el gate `protected-preview-live` termine verde;
- el test de PDF falsificado confirme 409, cero documentos registrados y limpieza del objeto temporal;
- no aparezca un nuevo error de runtime atribuible a PRE-006.

Hasta entonces el bloque G permanece formalmente al 25%.
