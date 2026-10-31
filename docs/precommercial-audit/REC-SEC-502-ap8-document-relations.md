# REC-SEC-502 · Preflight AP8 y relaciones hijas de documentos

## Hallazgo reproducido

En PostgreSQL 17 aislado con datos sintéticos, el preflight anterior devolvía
`ready` en dos configuraciones en las que el guard revisado no aseguraba la
identidad del original:

1. En una tabla particionada, el guard se clonó en la partición, pero otro
   trigger de esa partición modificó `NEW` después del guard. El chequeo solo
   inspeccionaba los triggers de la tabla padre.
2. Con herencia ordinaria, el trigger de fila del padre no se clonó en la tabla
   hija. Una actualización a través del padre cambió la identidad de una fila
   hija sin pasar por el guard.

Ambos casos mantienen RLS habilitada en las tablas de la prueba y el cuerpo del
guard revisado intacto. Las pruebas verifican primero que la modificación
sintética realmente pasa, y después exigen que el preflight indique `blocked`.
Sin la corrección fallaron con `ready` en ambos casos.

Esto no demuestra una modificación de documentos reales ni una explotación en
producción. La consulta de metadatos en producción identificó una tabla normal
`financial_app.documents` (`relkind = r`) sin tablas hijas directas.

## Corrección

El preflight de solo lectura solo considera revisada una tabla documental
ordinaria, que no sea partición y que no participe como padre ni como hija en
`pg_inherits`. En los demás casos añade el bloqueo
`document_relation_shape_unverified`. No pretende certificar esquemas
particionados o heredados: estos requieren revisar todas las relaciones y rutas
de escritura antes de admitirlos.

Las regresiones en PostgreSQL 17 en memoria cubren ambos caminos inseguros y
conservan el caso ordinario con guard válido, que sigue informando `ready` en el
fixture. El contrato Playwright revisa que el SQL siga siendo de solo lectura;
no requiere navegador para estas pruebas.

## Límite de producción

La consulta reforzada se ejecutó con `BEGIN READ ONLY`: informó
`standalone_document_table=1` y siguió `blocked` únicamente por
`original_immutability_missing`. Se observaron 32/32 tablas financieras con RLS,
3.188 registros fuente, 3.188 movimientos y ningún enlace huérfano. La consulta
no instala protección, no comprueba bytes de Storage, no acredita una sesión
propietaria ni sustituye el preflight o postflight de sincronización bancaria.
