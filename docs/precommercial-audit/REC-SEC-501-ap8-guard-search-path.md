# REC-SEC-501 · Preflight AP8: configuración del guard de originales

## Hallazgo reproducido

El preflight de solo lectura comprobaba el cuerpo y la identidad de la función
`financial_app.prevent_private_original_rewrite()`, pero no su configuración
`search_path`. En PostgreSQL 17 aislado y con datos sintéticos, al conservar el
cuerpo revisado y modificar esa configuración, el preflight anterior respondió
`ready`. Con un operador de texto artificial en ese path fue posible modificar
el nombre de un original de ensayo sin que saltara el guard.

La demostración requiere alterar la configuración de la función y disponer de
un esquema con ese operador. **No demuestra explotación ni acceso no autorizado
en producción.** El control protege frente a declarar preparada una configuración
que ya no coincide con la migración revisada.

## Corrección

El preflight exige la configuración exacta de la migración revisada
`20261011205000_ap1_private_document_original_immutable.sql`, que fija el search
path vacío. Si se elimina o cambia esa configuración, informa
`original_immutability_missing` y permanece `blocked`. No modifica la función,
datos bancarios, documentos ni la configuración de ninguna base.

La regresión en PostgreSQL 17 en memoria comprueba el caso canónico, un path
eliminado, el operador adversario y la restauración de la configuración. El caso
original falló antes de aplicar la corrección. Los contratos de solo lectura y
las demás pruebas AP8 se mantienen.

## Límite de producción

La consulta reforzada, ejecutada exclusivamente en lectura el 27/10/2026,
devuelve `blocked` por `original_immutability_missing`: no están presentes ni el
trigger ni la función revisada. Esto no es una prueba de autenticación
propietaria, de objetos Storage, de
completitud de Google Sheets ni de migraciones aplicadas. La preview comparte
la base de producción en modo restringido; no se utilizó para escrituras.
