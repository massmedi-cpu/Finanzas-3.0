# AUD-E2E · actualización y reversión sobre el backup real

El backup de Producción [37877870394](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/37877870394)
terminó con sus tres jobs SUCCESS. Su manifest acredita 10.0.102, esquema 14 y
SHA `0d278a361ba8c0dfef0c116374a21af20782abdb`. La copia cifrada contiene DB y
Storage, con hashes y restore PostgreSQL 17 comprobados; el artefacto
`11592759027` vence el 16/10/2026.

## Ensayo de actualización

La workflow nueva se limita a la PR #561 interna. Verifica el run, SHA, conclusión,
artefacto y digest exactos antes de descargarlo; falla si main ha cambiado o la
copia ha vencido. Solo necesita el secreto de protección ya configurado, durante
la descodificación en el runner temporal. No recibe contraseña de DB, service key
ni ruta productiva y no escribe en ningún proyecto remoto.

El formato portable de backup v2 usa `pg_dump --no-privileges`: el restore previo
acredita integridad de datos, pero por sí solo no reproduce los permisos de la
aplicación. El ensayo reconstruye el catálogo de permisos leído el 09/10 desde
Producción: 157 objetos, 124 funciones y hashes de sus definiciones; sin usuarios,
tokens ni datos financieros. Comprueba las definiciones contra el backup real,
mantiene el rol gateway sin bypass de RLS y aplica exactamente los permisos
capturados en la copia temporal.

Después aplica, en una transacción, los cuatro ficheros revisados:

1. `20261006160500_qa08_home_balance_series_10_0_89.sql`: función ausente aunque el fichero ya estaba en main.
2. `20261007165000_qa_work_budget_snapshot_batch.sql`: snapshot presupuestario por lotes.
3. `20261008154928_aud_e2e_document_test_designation.sql`: designación y vistas documentales explícitas.
4. `20261008155833_aud_e2e_category_leaf_permissions.sql`: permisos de helpers; ya concedidos en Producción, se comprueba su replay idempotente.

La comparación presupuestaria usa una copia ejecutable de la función productiva
anterior, sin renombrar su OID original. Se ejecutan los siete meses y casos de
guardado/relectura/reparto, además de designación/reversión, permisos, contadores
y paginación documental. Cada fixture tiene su espacio sintético y termina en
ROLLBACK. Los hashes de las columnas originales de todas las tablas de negocio
deben coincidir antes, después de migrar, después de los casos y tras revertir.

## Reversión

El ensayo restaura las definiciones y permisos anteriores de las funciones
reemplazadas y retira las funciones nuevas con DROP sin CASCADE. Mantiene las
cuatro columnas aditivas y sus restricciones para conservar cualquier procedencia
documental si un release futuro tuviera que revertirse. Comprueba toda la
superficie original de funciones, RLS/políticas y datos; los controles runtime
siguen vacíos. No es un borrado ni un restore de datos sobre Producción.

La publicación requiere ejecutar esta prueba y leer `AUD_RELEASE_DB|status=ok`
y `AUD_RELEASE_BACKUP|status=ok` del SHA candidato exacto. Un fichero preparado
o un run pendiente no acreditan aprobación.

## Límites de publicación

El backend Edge activo v85 importa el commit `34f926d5e7b968607253ae63ff015525f2072bff`;
la corrección JSONB candidata exige desplegar el gateway junto al frontend.
Para revertir, conservar ese wrapper inmutable y su import map.

Este ensayo cubre el cambio SQL desde la copia real, con ACLs reconstruidos;
Auth/Storage del restore usan los stubs del verificador portable. No sustituye
la aceptación integral VAL-001, el recorrido publicado browser→Next→Edge,
Drive/exportación/PWA ni la revisión del F11 por su propietario. DOC-002 y VAL-001
permanecen abiertas hasta superar sus criterios. Producción continúa 10.0.102;
publicar únicamente la última candidata completa y aceptada.
