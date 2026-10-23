# REC-G5-362 · contrato exacto de selección de corpus privado

Fecha: 23/10/2026. Aplicación Financial App estrictamente personal, fuente bancaria solo lectura.

## Fallo real localizado

El runner de evaluación privada requiere **17 documentos de desarrollo previamente inspeccionados y otros 8 PDF reservados**, congelados antes de abrirlos (25 en total). Sin embargo, el selector automático `scripts/verify-private-ocr-corpus-selection.mjs` contenía un contrato de **16 desarrollo + 8 reserva** (24 en total), y el guard obligatorio repetía ese número incorrecto. Así, superar su salida `status=ok` no garantizaba alcanzar el mínimo de G5.

## Corrección acumulativa

- REC-G5-362: distribución base de 17 desarrollo y 8 holdout. La cuota de la familia «supermercado» pasa de seis a siete en desarrollo, conservando **dos documentos nuevos de reserva** en esa familia. Resto de familias y límites de diversidad se mantienen.
- Inventario mínimo **25** elementos; rechazo explícito de 24 incluso cuando el subconjunto sea válido.
- Auto-test sintético asegura los 25 identificadores distintos, cuotas por las seis familias, protección de archivos previamente inspeccionados, rechazo de documentos públicos/contratos, historial de apertura obligatorio y máximo 12 carpetas.
- El guard y el test Playwright REC-G5-362 exigen el mismo 17+8. El archivo del test queda ejecutado en `product-recovery-ui.yml` y su presencia se prueba en el guard.
- Ningún original privado se abre en GitHub Actions; los IDs, nombres, importes, contraseñas y PDF privados no entran en el repositorio, logs, Notion ni Trello.

## Qué no certifica

Esta corrección **no** genera ni valida por sí misma los 17 documentos originales, sus valores GOLD humanos o los 8 holdout sin abrir. El selector acepta metadatos privados aportados por el propietario y sigue sin reemplazar el ledger real del runner de G5. La CI del nuevo SHA debe concluir antes de declarar su prueba técnica verde. Sin publicación, sincronización bancaria ni modificación en producción.
