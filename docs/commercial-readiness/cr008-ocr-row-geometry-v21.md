# CR-008 · Filas y recortes OCR sobre V20

Estado: candidato de corrección; CR008-OCR-002 sigue abierto.

Base exacta: `8408c385b7cff3f710a250d39f820a5836a829d4` (V20).
Esta rama conserva las mejoras anteriores de columnas, consenso y límites horizontales.

## Fallo reproducido

La foto privada utilizada como caso de cierre se pudo ejecutar localmente antes de que el entorno dejara de estar disponible. La composición V20 tardó 20,2 s y produjo 72 lecturas de celdas, 0 consensos y 0 cambios. La comprobación local no equivale a un replay autenticado del objeto almacenado en Preview: no se ha confirmado que ambas copias tengan los mismos bytes o resolución.

Una marca alta de sombra puede solaparse con varias filas. El agrupador anterior comparaba cada palabra con la caja acumulada de una fila; esa caja crecía hasta mezclar cabecera, productos o totales. El defecto aparece tanto en el filtro de anclas como en la recuperación numérica y la reconstrucción final.

El caso de regresión de geometría, ejecutado como JavaScript con el algoritmo anterior y el nuevo, produce dos grupos antes y cuatro después (cabecera y tres productos). Se conservan las mismas palabras y sus objetos, incluido el texto ambiguo `560` / `5,508`.

## Cambio

- Un único agrupador compartido utiliza centros y alturas típicas. Los glifos regulares se agrupan primero; una marca de altura anómala no puede iniciar una fila que absorba las vecinas.
- El filtro de anclas y la recuperación numérica calculan la altura de texto sin marcas que atraviesan varias líneas. La evidencia original se conserva.
- El recorte de una celda usa los glifos de su columna, o los demás números de esa misma fila si falta la celda. Se elimina la expansión vertical de 1,55–2 veces que incluía otras filas.
- En Base/IVA/Total, el área numérica se deriva del espacio situado después de la etiqueta: un total impreso con caracteres grandes no debe perder sus primeros dígitos por usar el ancho de una celda de producto.
- Se conservan los límites horizontales de V20 para las columnas de productos, la lectura física de separadores y el consenso antes de reemplazar un importe. No se insertan decimales ni se calculan valores para completar el ticket.
- La batería OCR sin navegador incorpora las regresiones de V14–V20 que su expresión de selección omitía y las nuevas pruebas de geometría.

## Validación y límites

La rama incluye pruebas de unión de filas por ruido alto, coherencia entre filtro/recuperación/representación, límites de recorte y línea inclinada. GitHub Actions debe validar el build y las regresiones existentes sobre el commit candidato.

Los experimentos locales de iluminación y lectura por celdas mejoraron algunos resultados del ticket, pero no se incluyen como una corrección certificada: falta comprobar la composición completa sobre la foto original. La foto y sus versiones procesadas no se publican en el repositorio.

No se modifica la fuente bancaria, la persistencia ni las reglas de revisión humana. El OCR no se promueve a main o Production hasta pasar el caso real completo y las regresiones.
