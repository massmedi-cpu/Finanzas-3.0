# Financial App 1.8.0 — auditoría de recuperación privada

## Objetivo

La 1.8.0 convierte la copia privada portable de 1.7 en un mecanismo de recuperación verificable y transaccional, sin copiar ni escribir la fuente bancaria.

## Implementado

- Formato de copia privada `formatVersion: 2`.
- Anclas técnicas de origen (`sourceId`, `sourceHash`, `sourceMissing`) para comprobar que los movimientos que existían al crear la copia siguen siendo los mismos.
- Compatibilidad con una fuente que haya incorporado movimientos nuevos después de crear la copia.
- Vista previa de recuperación de solo lectura con diferencias por área.
- Huella de la copia calculada antes de restaurar y exigida de nuevo al ejecutar la operación.
- Confirmación explícita exacta `RESTAURAR`.
- Checkpoint automático del estado privado inmediatamente anterior.
- Restauración completa en una única transacción PostgreSQL con bloqueo para evitar dos restauraciones simultáneas.
- Restauración por `upsert` y desactivación/archivo controlado para no destruir historiales relacionados.
- Cobertura de ediciones de movimientos, splits, presupuestos, previsiones y sus ocurrencias, patrimonio, objetivos, reglas, conciliaciones, preferencias, alertas, cierres, documentos y vínculos documento-movimiento.
- Conservación del texto OCR existente de los documentos durante una recuperación portable: la copia no necesita transportar el texto OCR completo.

## Compatibilidad

Las copias de formato 1 creadas con 1.7 pueden analizarse, pero no se habilita su restauración automática. Deben volver a exportarse con 1.8 para incorporar anclas de origen y la información adicional necesaria para una recuperación segura.

Una copia 1.8 no queda invalidada porque la fuente bancaria haya añadido movimientos después. Sí se bloquea si desaparece o cambia alguno de los movimientos de origen existentes cuando se creó la copia.

## Protección de historial

No se realiza un `delete all` de entidades que tienen historiales dependientes. Los elementos que ya no pertenecen al snapshot se desactivan, cancelan o archivan según su dominio. Los hijos operativos sin historial propio (por ejemplo splits, ocurrencias y vínculos) se reconcilian exactamente con la copia.

## Pruebas ejecutadas contra la base real

Las pruebas de restauración se realizaron dentro de una transacción exterior terminada con `ROLLBACK`, por lo que el recorrido de escritura se ejecutó realmente sin dejar cambios de prueba en los datos del usuario.

Casos comprobados:

1. Exportación de formato 2 y preview seguros con la fuente actual.
2. Restauración completa con creación de checkpoint.
3. Rechazo de copia 1.7 para restauración automática.
4. Rechazo de una ancla de origen manipulada.
5. Aceptación de una copia anterior cuando la única diferencia es que la fuente contiene movimientos posteriores.
6. Validación de referencias y claves duplicadas antes de habilitar la restauración.

## OCR y privacidad

El contenido del documento se sigue reconociendo en el navegador (`worker.recognize(file)`) y no se envía a un servicio OCR de terceros. En 1.8 no se afirma funcionamiento OCR completamente offline: los activos del motor Tesseract continúan cargándose desde CDN y su empaquetado first-party queda como endurecimiento posterior independiente.

## Recursos y despliegue

La rama `financial-app-rebuild` mantiene deshabilitados los previews automáticos de Vercel durante el desarrollo. La 1.8 se valida primero mediante base de datos, auditorías, tests, typecheck y build; el despliegue visual queda separado para no consumir recursos gratuitos innecesarios.
