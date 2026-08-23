# Financial App 3.0.5 — OCR y versión instalada

- El OCR de tickets debe usar TSV de Tesseract con confianza y coordenadas, no sólo texto plano.
- Debe descartar ruido de baja confianza y conservar columnas mediante reconstrucción posicional.
- Debe aplicar contraste adaptativo a fotografías con iluminación desigual.
- Debe mantener cámara, galería, documentos, Activos/Archivados, restauración y eliminación definitiva.
- `APP_VERSION` y `financial_app.app_meta.app_version/target_version` deben indicar 3.0.5.
- La rama de trabajo no genera Preview de Vercel.
- Antes de producción deben pasar todos los gates históricos, OCR, accesibilidad, TypeScript y build.
