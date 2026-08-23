# Financial App · Archive/OCR 3.0.4

Hotfix aditivo sobre la base 3.0.0 validada.

- OCR local de tickets con detección/recorte automático del papel, contraste y varias segmentaciones Tesseract.
- Conservación de saltos y espaciado para una reconstrucción visual similar al ticket original.
- Caso de regresión basado en un ticket real: MI RESTAURANTE · 2026-07-11 · 44,60 EUR.
- Botones de Archivo con tamaño táctil y tipografía consistente.
- Ciclo explícito Activos → Archivados → Restaurar o Eliminar definitivamente.
- La eliminación definitiva sólo se permite tras archivar y elimina el original privado del bucket antes de borrar metadatos/vínculos.
- Sin cambios en movimientos bancarios ni en la fuente Excel de solo lectura.
