# REC-AP8-503 · Ensayo AP8 con copia reciente verificada

## Problema

El ensayo de cinco migraciones y reversión descargaba una copia auténtica
fijada por identificador y huella. Aunque esa copia había pasado su restore,
una copia más reciente podía haber sido creada y restaurada por separado.
Además, el identificador fijado caduca: después de su vencimiento, la CI no
puede repetir el ensayo sin cambiar código, incluso si hay otra copia segura.

## Solución y controles

El selector obtiene únicamente metadatos de GitHub y escoge el último run
completado del flujo revisado de copia productiva, creado en las últimas 24
horas. No retrocede silenciosamente a un run anterior si el último está fallido,
es ambiguo o no puede verificarse. La selección falla cerrada si la lista está
incompleta, hay más de 100 resultados o el reloj/las fechas no son válidos.

El run debe pertenecer al repositorio, flujo, rama `main` y commit de `main`
revisados; los jobs de validación, copia y restore deben haber terminado con
éxito en el mismo intento. Se exige exactamente un artifact cifrado, asociado
al mismo run, repositorio y commit, con la identidad de producción esperada,
huella SHA-256 válida y al menos 45 minutos de retención. La identidad de
producción y el commit actual de `main` se comprueban antes y después del ensayo.

La descarga usa una versión fijada de `actions/download-artifact` que falla
ante una discrepancia de huella; después se comprueba la huella del cifrado y
se descifra únicamente en el runner efímero. Los datos se restauran y se ensayan
en PostgreSQL 17 aislado, con las mismas cinco migraciones y rollback. No se
modifican producción, archivos originales ni movimientos bancarios. No se
guardan copias descifradas ni datos financieros en logs o artifacts de CI.

La política está deliberadamente fijada a la producción `10.0.103` y al commit
de `main` revisados. Un cambio real de producción o de `main` requiere una
revisión explícita de la política: no se amplían automáticamente las identidades
de confianza.

## Verificación y límites

Las pruebas unitarias usan metadatos sintéticos y cubren copias obsoletas,
fallos del run más reciente, trabajos omitidos, procedencia incorrecta,
identificadores inválidos, ambigüedad, caducidad, huella ausente y deriva de
producción o de `main`. También verifican que el token de GitHub no se envía
al dominio productivo y que no se siguen redirecciones.

Un contraste de solo lectura con los metadatos reales eligió el run
`40490358332` y su artifact `12728012784`, que ya había completado backup,
restauración y validación de Storage. Esa comprobación no descargó la copia y
no sustituye la ejecución del nuevo ensayo completo en CI. El resultado del
ensayo debe indicar el run y artifact realmente elegidos; una copia creada
después de la selección puede ser más reciente.

Este ensayo no certifica la sesión del propietario, el gateway productivo, la
sincronización de las 20 altas ni el postflight final. Antes de publicar siguen
siendo necesarios un backup fresco del corte, el resto de puertas y la revisión
de si ha cambiado producción desde su captura.
