# Financial App 10.0.4 · candidato de coherencia regional y de Inicio

Fecha: 2026-09-25. Base verificada: Production `10.0.3`, commit
`79708742358fdbc74159f8838b14fa85896fe6d5`, deployment
`dpl_GSAqWXHiYvn6zqgCLkSz9raR1Kjs`, `/api/build` en Production.

## Cambio acumulativo

- La presentación de importes usa una sola función de céntimos en las superficies
  financieras, documentos, búsqueda y configuración. Agrupa desde 1.000 y conserva
  el último céntimo hasta el máximo entero seguro sin pasar por euros en coma flotante.
- Los formularios de Presupuestos, Documentos y Reglas comparten conversión exacta
  de entrada y salida. Admiten coma española y el punto decimal sencillo que ya
  aceptaban. Los valores inválidos o fuera del rango seguro se rechazan.
- Porcentajes, puntos porcentuales y contadores visibles usan la capa regional
  común. No se modifican importes almacenados ni contratos de persistencia.
- Inicio comprueba el saldo consolidado contra las cuentas activas, el mes actual
  contra su serie mensual cuando ambos cortes coinciden, y el mes del presupuesto.
  Una discrepancia oculta sólo las cifras afectadas y deja visibles las demás
  fuentes y la actividad. Los fallos de carga se distinguen de los estados vacíos.
- La fuente bancaria y las operaciones de lectura permanecen sin cambios.

## Evidencia local del candidato

- 26 contratos puros aprobados: fundamentos, formato y conciliación de Inicio,
  presupuestos, Cash Flow, comparador y capacidad de 10.000 observaciones.
- `npm run typecheck`, `npm run build` y `git diff --check`: correctos.
- Los contratos estructurales de Inicio y sus funciones puras pasan localmente.
  Chromium local no se puede descargar en este entorno: el archivo llega truncado.
- En el primer candidato, la suite de Análisis pasó. Tras corregir expectativas
  obsoletas de formato y de estado de las fuentes, la suite de valor de usuario
  pasó en CI. La batería general completó 895 pruebas y señaló tres selectores
  ambiguos del test (alerta de Next y navegación móvil), corregidos después.
  Estas observaciones son de commits intermedios; no sustituyen el gate del SHA final.

## Gate de publicación pendiente

1. CI completo y recorrido visual de Inicio/editores sobre el commit exacto.
2. Vercel Preview READY, identidad `/api/build` y prueba de Preview protegida.
3. Integración en `main`, comprobación de Production `10.0.4` y ausencia de errores
   nuevos atribuibles al candidato.
4. Manifiesto/tag del release y actualización de la trazabilidad del diagrama
   canónico cuando el mismo SHA esté verificado.

Este documento describe un candidato. No acredita por sí solo despliegue ni
validación visual.
