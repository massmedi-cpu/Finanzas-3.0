# Financial App 1.9.0 — motor documental first-party

## Objetivo

La 1.9.0 elimina las dependencias CDN en tiempo de uso del módulo Archivo. El procesamiento de PDF y OCR continúa ejecutándose en el navegador, pero los motores, workers, cores WASM y datos de idioma pasan a servirse desde el mismo origen de Financial App.

## Implementado

- Tesseract.js fijado a `7.0.0` mediante `package-lock.json`.
- PDF.js fijado a `6.2.108` mediante `package-lock.json`.
- Datos OCR españoles fijados a `@tesseract.js-data/spa 1.0.0`, conservando `spa.traineddata.gz` de la familia 4.0.0 ya utilizada por el flujo anterior.
- Script reproducible `scripts/prepare-document-engine.mjs` que materializa los assets desde `node_modules` en `public/vendor/document-engine/` durante instalación, desarrollo y build.
- El repositorio no versiona los binarios generados: se reconstruyen siempre desde el lockfile.
- Se copian todas las variantes `tesseract-core*.wasm.js` disponibles para permitir que Tesseract elija el core compatible con el dispositivo.
- PDF.js principal y su worker se cargan desde rutas same-origin.
- Tesseract principal, worker, core y `langPath` se cargan desde rutas same-origin.
- El resultado OCR registra `localProcessing: true` y `assetOrigin: same-origin`.

## Integridad de assets

Cada preparación genera `public/vendor/document-engine/manifest.json` con:

- versión de la aplicación;
- versiones exactas de los paquetes resueltas desde `package-lock.json`;
- ruta de cada asset;
- tamaño en bytes;
- SHA-256 de cada fichero.

`audit:v19` recalcula tamaños y hashes y detiene CI si cualquier asset no coincide.

## Protección contra regresiones

La auditoría 1.9 falla si:

- reaparece `cdn.jsdelivr.net`, `tessdata.projectnaptha.com` o `unpkg.com` en el flujo documental;
- falta un asset necesario;
- `package.json`, `package-lock.json` y `APP_VERSION` dejan de coincidir;
- cambian las versiones fijadas de Tesseract/PDF.js/datos españoles;
- faltan variantes del core Tesseract;
- un hash o tamaño no coincide con el manifest generado.

## Privacidad

El documento original se guarda en el bucket privado previsto por Financial App. La extracción de texto y OCR se ejecuta en el dispositivo del usuario; no se envía el contenido a un servicio OCR de terceros. La 1.9 además elimina la necesidad de descargar en tiempo de uso motores o modelos desde CDNs externos.

## Despliegue

La rama `financial-app-rebuild` continúa con previews automáticos de Vercel deshabilitados. La versión se valida primero mediante CI, typecheck, build y auditorías sin consumir despliegues de preview innecesarios.
