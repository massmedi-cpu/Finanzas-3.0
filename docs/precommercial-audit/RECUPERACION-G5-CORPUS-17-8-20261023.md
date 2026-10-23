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

## Complemento REC-G5-363: distribución real del grupo previamente examinado

La auditoría privada **anonimizada de 22/10/2026**, recuperada en el espacio de archivos del usuario, acredita **17 PDF ya inspeccionados, 35 páginas y 17 huellas SHA-256 verificadas localmente**. Su distribución real fue: 4 suministros, 2 telecomunicaciones, 6 supermercados, **3 transporte**, 1 tecnología y **1 otros**. El primer commit REC-G5-362 corrigió el total 16→17, pero asignó la unidad adicional a supermercados por disponibilidad de metadatos: eso no preservaba la cohorte histórica, pues mantenía sólo un documento de transporte en desarrollo. No se ha afirmado ejecución de la cadena OCR financiera.

REC-G5-363 rectifica las cuotas de DESARROLLO a [4,2,6,3,1,1] (17 exactos), sin cambiar el HOLDOUT [2,1,2,1,1,1] (8). Añade auto-test sintético donde esos 17 están marcados previamente inspeccionados: se deben conservar **17/17 en desarrollo**, **0 excluidos**, con ocho reserva estrictamente sin abrir. Añade prueba de contrato Playwright y su exigencia en el guard obligatorio. No se publican ni abren originales; el registro SHA-256 histórico verificado en otro entorno no está disponible para su cotejo en esta ejecución y por eso G5 real sigue pendiente.

La preselección de Drive de 40 posibles documentos por metadatos permanece válida como inventario amplio, pero la asignación preliminar de 11 carpetas calculada para las CUOTAS anteriores no debe presentarse como validación de las nuevas cuotas. El límite físico de 12 carpetas exige comprobarse otra vez con la distribución real y el ledger privado.

## REC-G5-364 · verificación de la privacidad heredada

Control de seguridad añadido a la selección privada. El atributo de Drive `shared=false` del propio PDF y la comprobación aislada de la carpeta directa **no demuestran que sus carpetas antecesoras sean privadas**. Por eso, el selector rechaza cualquier PDF preliminarmente elegible si `privateAncestorsVerified !== true`. El nuevo indicador solo se declara `true` después de revisar, en el entorno privado del propietario, todos los antecesores hasta la raíz y sus permisos efectivos; no debe inferirse de `shared=false` ni del nombre de carpeta. El programa no consulta por sí mismo las ACL de Google y **no convierte una declaración manual en prueba de permisos**.

Dos pruebas negativas comprueban la falta del indicador y su valor falso; REC-G5-364 ejecuta el auto-test en CI únicamente con metadatos sintéticos. Las 40 coincidencias por nombre de Drive y 11 carpetas directas siguen siendo **candidatos, no corpus seguro certificado**. Antes de cualquier G5 real faltan: recuperar ledger nominal privado de 17 SHA-256, contrastar su identidad con metadatos, verificar cadena ACL y asignación de las nuevas cuotas, congelar ocho PDF efectivamente nuevos con verdad humana independiente, y ejecutar el OCR local de la aplicación. Ningún PDF se abre, transmite ni sube; originales bancarios, PostgreSQL productivo, Google Sheets y producción 10.0.103 permanecen intactos.
