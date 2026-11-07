# REC-POST-348/349 · Conciliación bancaria de contenido íntegro (23/10/2026)

## Hallazgo y reparación
La conciliación anterior cotejaba identidad, cuenta, fecha, céntimos y saldo. Si se cambiaba el concepto, la categorización o alguna otra celda del origen sin variar las cifras, podía considerar el registro coincidente. El origen y la tabla de persistencia ya disponen de `sourceFingerprint` / `source_fingerprint` (SHA-256 de la fila canónica completa).

El contrato nuevo exige esta huella para **cada** fila persistida y cada observación oficial. La ruta de servidor compara SHA-256 sin enviarlos al navegador y cuenta los desacuerdos en `differences.sourceFingerprint`; incluso sin discrepancias numéricas bloquea la conciliación si cambia el contenido. La interfaz solo muestra la cantidad de registros con diferencias y lenguaje genérico. Los campos se obtienen de `financial_app.transaction_source_records.source_fingerprint` mediante consulta de solo lectura y ya acotada por archivo/workspace, sin nuevas escrituras.

## Compatibilidad y despliegue
El nuevo contrato es deliberadamente estricto: un gateway antiguo que devuelve siete columnas en vez de las ocho requeridas deja la conciliación **no disponible**; nunca finge `verified`. Para que la nueva funcionalidad opere en producción es preciso desplegar juntos el gateway verificado y el frontend, tras los gates, copia de seguridad reciente y aceptación. No adelantar el despliegue solo para ver el panel.

## Pruebas
- REC-POST-348: fecha, cuenta, céntimos y saldo iguales pero huella distinta -> `blocked`, recuento explícito y cero SHA público; rechaza informe público contradictorio.
- REC-POST-349: gateway devuelve huellas válidas y comprueba conciliación, rechaza mutación del contenido.
- REC-POST-288/291: huella ausente o malformada y SQL de gateway obligatoriamente con campo y límites; incompatibilidad antigua falla de forma cerrada.
- Gate integrado escritorio/móvil exige las dos regresiones.

## Evidencia bancaria independiente ya comprobada
El inventario real verificado de solo lectura sumó 3.208 IDs Google Sheets (3.191 corriente y 17 ahorro) frente a 3.188 persistidos (3.173 y 15), con 18/2 faltantes, ningún huérfano, y coincidencia de **ID, fecha, importe y saldo** para los 3.188. Se conservaron 134 saldos desconocidos como nulos; **no se ha demostrado aún** igualdad de SHA completo para las 3.188 filas, por lo que no afirmar que la sincronización integral está certificada. No se escribió en Sheets, Supabase ni producción.

PR #619 DRAFT, producción 10.0.103 intacta; sin cambio de versión hasta release. Monousuario, fuente bancaria oficial de solo lectura, ningún servicio de pago o tarjeta.
