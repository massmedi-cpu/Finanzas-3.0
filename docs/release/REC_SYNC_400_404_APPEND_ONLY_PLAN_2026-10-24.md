# REC-SYNC-400–404 — Plan de altas bancarias con originales inmutables

Fecha: 24/10/2026. PR #619 candidata; **NO-GO, NO IMPORTACIÓN PRODUCTIVA**.

## Problema y mecanismo

El origen Google tenía 3.208 observaciones y PostgreSQL 3.188 originales el 23/10. La auditoría read-only de las 22 columnas mostró 3.187 payloads idénticos y una fecha guardada DD/MM/YYYY frente a un serial entero nuevo, mismo día y otros 21 valores con mismo tipo. El postflight original compara el hash completo, por diseño bloquea toda actualización. Desactivar esa comparación permitiría revisiones históricas ilegítimas.

`prepareVerifiedAppendOnlySourcePlan` compara dos fotografías independientes y completas, recalcula los hashes y construye un lote canónico. Para una fila histórica con ese único cambio de representación, usa exactamente **el payload y hash originales persistidos**; para movimientos nuevos usa los 22 campos actuales de Google. Rechaza cualquier diferencia de otros valores, un huérfano, duplicados, falsificaciones, payloads incompletos y ausencia de línea de base. Ni Google ni DB cambian durante su preparación.

`verifyPlannedAppendOnlyPostflight` contrasta el plan resultante contra la respuesta independiente de ocho columnas del gateway. El contrato público antiguo sigue estricto: la fecha distinta de la fotografía Google no se oculta ni se llama coincidencia literal. El estado de representación se conserva explícito y no se utiliza para afirmar que la fuente original tuvo un hash idéntico.

`source.original_rows` solo admite solicitudes al gateway **production**, después de OIDC, sesión y membresía verificados en el handler principal; SQL limita por workbook y workspace, exige contexto GUC y rechaza más de 10.000 resultados. La respuesta privada contiene el payload de 22 campos para uso exclusivo del servidor; no se añade a la lista de acciones permitidas desde previews y NO existe ruta pública que lo exponga. La vista cliente sigue usando el postflight agregado anónimo.

## Puertas pendientes (obligatorias)

1. Integrar el plan verificado con el POST server-side de sincronización **sin reutilizar un preflight caducado**. Exigir que gateway production declare capacidad compatible con lectura de originales; no basta el actual v86.
2. Validar en PostgreSQL 17 efímero que los 3.188 originales/huellas/payloads se conservan byte a byte y que una revisión concurrente aborta la transacción entera; ejecutar contra datos sintéticos y restauración auténtica aislada.
3. Hacer respaldo cifrado FRESCO de la producción existente, verificar restauración y rollback; no escribir nada antes de ese gate.
4. Desplegar gateway nuevo con rollback probado y solo después reconciliar Google con base de datos, reconfirmar 20 altas, ejecutar una importación idempotente y comprobar postflight independiente 3.208/3.208 y zero revisiones.
5. Certificar AP2 real, QA con sesión y CI exacta y únicamente entonces considerar publicar #619.

El mecanismo es un **paso de implementación** de AP5, no certifica AP5, no publica y no autoriza cualquier escritura de datos. No copiar payloads reales a logs, artefactos ni al repo.