# REC-AP8-308 · Preflight de base de datos productiva en modo solo lectura
Fecha 22/10/2026. Financial App personal. Fuente oficial en Google Sheets estrictamente solo lectura.

## Ejecución efectuada contra Supabase real
La consulta se ejecutó con `BEGIN READ ONLY` y devolvió **`ap8_db_readiness=blocked`**, exactamente con el bloqueo **`original_immutability_missing`**. Comprobaciones concretas: 6/6 columnas del contrato documental presentes; 32/32 tablas financieras con RLS; 3188 fuentes y 3188 transacciones; 0 fuentes huérfanas y 0 movimientos huérfanos; 0 triggers y 0 funciones activas de inmutabilidad de originales. Ninguna mutación, SQL DDL, ni identificadores privados expuestos.

## Artefactos y límites de la comprobación
- `scripts/rec-ap8-readiness-readonly.sql` reproduce la consulta con estado `ready/blocked` y códigos de bloqueo estables. No contiene rutas a secretos ni filas bancarias. La migración pendiente `20261011205000_ap1_private_document_original_immutable.sql` **no está instalada** en productivo.
- `tests/e2e/ap8-readiness-contract.spec.ts` añade REC-AP8-308: comprueba lectura obligatoria, integridad de las condiciones, ausencia de DDL/DML y rechazo de falsos indicadores de postflight. Se ejecuta en la suite obligatoria de navegador, sin conexión a producción ni secretos.
- El archivo SQL figura en los disparadores de `product-recovery-ui.yml`: cualquier modificación exige recertificar. El guard verifica que la prueba esté realmente incluida.
- **Importante:** el estado `ready` de este SQL solo verifica una fracción de AP8; **nunca** certifica sincronización bancaria, cobertura contra Google Sheets, la versión del gateway Edge, restore real, despliegue, ni corrección del OCR.
- El gateway productivo sigue en **v86** y no incluye `source.postflight_rows`. La PR #619 sigue DRAFT; ninguna migración o deploy se ejecuta solo por el resultado de este SQL.
- Fuente oficial anterior: 3208 movimientos, con 3188 presentes y 20 pendientes; la consulta no importa movimientos ni actualiza facturas.

## 27/10/2026 · Comprobación endurecida, sin cambios en producción

En PostgreSQL 17 desechable con datos ficticios se reprodujeron cuatro falsos
`ready` del chequeo anterior: un trigger limitado a otra columna, uno con
`WHEN (false)` y una función que solo contenía los textos buscados en
comentarios; además, un trigger posterior podía modificar la clave después del
guard legítimo. En los cuatro casos se permitía cambiar la clave de Storage.
Esto era un defecto del chequeo, no evidencia de que alguna de esas
configuraciones existiera en producción. La consulta reforzada se ejecutó
contra producción con `BEGIN READ ONLY`: devolvió `blocked` porque el trigger
y la función no están instalados, con 32/32 tablas bajo RLS, 3188 movimientos,
3188 fuentes, cero enlaces huérfanos y cero triggers adicionales sin verificar.

La consulta sigue siendo solo lectura y ahora rechaza filtros de columna,
condiciones, tipos de trigger diferentes y cuerpos que no coinciden con la
función revisada de la migración AP1. Además, bloquea otros triggers activos
`BEFORE UPDATE ROW` que no sean el helper `documents_touch_updated_at` revisado,
que sí existe en producción, y cuenta tablas particionadas al comprobar RLS.
La huella SHA-256 verifica identidad del
texto almacenado, no sustituye una prueba de comportamiento sobre el backend
real ni certifica la inmutabilidad de los bytes en Storage. Un cambio legítimo
de cuerpo o la incorporación de otro trigger exige revisión y actualización
coordinada del chequeo; ante dudas, queda `blocked`.

La regresión ejecutable `tests/unit/ap8-readiness-pg17.test.mjs` usa PostgreSQL
17 en memoria, exclusivamente con datos sintéticos, y forma parte de la matriz
CI. Verifica también que la función canónica impide modificar los seis campos
originales y permite editar notas. No aplica migraciones en la base productiva,
no prueba Google ni el gateway, y no cambia el estado NO-GO de la release.
