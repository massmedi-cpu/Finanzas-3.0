# OCR 5.0.1 r2

Corrección del motor OCR local de tickets a partir del caso real de Ávila Bar — Victoria Kent.

## Problema observado

La reconstrucción geométrica TSV podía ser parcial y sustituir al texto bruto completo de Tesseract. En consecuencia, una tabla con cinco consumiciones podía terminar mostrando solo tres. Esa reconstrucción incompleta también podía provocar lecturas completas adicionales, aumentando el tiempo de procesamiento.

## Contrato r2

- El texto bruto normalizado es la fuente canónica y no puede ser eliminado por una reconstrucción parcial.
- TSV se usa para estructura y columnas, no para recortar el contenido textual reconocido.
- La primera lectura usa una superficie recortada y contrastada en escala de grises con PSM6.
- Las fotos verticales anchas eliminan márgenes laterales para reducir fondo ajeno al ticket.
- Una segunda pasada adaptativa PSM4 solo se ejecuta si faltan datos críticos o no se obtiene ninguna fila útil.
- Si existen dos lecturas, una línea alternativa solo puede sustituir a la principal de forma segura; en líneas de producto con la misma firma numérica se permite escoger la descripción textual más completa.
- No existe una tercera pasada completa ni una lectura separada obligatoria de totales.

El método queda registrado como `image_ocr_receipt_v501:r2:*` y mantiene el procesamiento íntegramente local en el navegador.
