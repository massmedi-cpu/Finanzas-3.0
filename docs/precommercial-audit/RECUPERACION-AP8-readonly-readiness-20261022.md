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
