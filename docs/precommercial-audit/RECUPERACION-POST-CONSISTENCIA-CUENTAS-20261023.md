# REC-POST-350 · Cierre de informes agregados incoherentes por cuenta (23/10/2026)

## Incidencia verificable en el contrato
El validador del informe público exigía la suma de recuentos globales y por cuenta, pero no
comprobaba que cada cuenta persistida contuviera al menos sus movimientos **coincidentes y
huérfanos**. Un JSON con filas «coincidentes» movidas artificialmente a otra cuenta podía
seguir sumando 3/3 globales y llegar al navegador como `verified`. El servidor normal
construye el resultado correctamente; el fallo afectaba al rechazo en cliente de informes
incoherentes, no constituye evidencia de alteración bancaria real.

## Cambio acumulativo
- Rechazar por cuenta `matchingRows + orphanRows > persistedRows`. La cuenta de origen
  de una fila discrepante sí puede diferir de la cuenta persistida: este caso auténtico se
  preserva como `blocked` y no se falsea la pertenencia.
- Rechazar cuentas fantasma con todos los recuentos a cero.
- Exigir etiquetas públicas canónicas consecutivas `Cuenta 1`, `Cuenta 2`, etc.,
  sin mostrar identidades bancarias ni cambiar el conteo.
- `REC-POST-350` exige en prueba sintética: rechazo de redistribución de contadores
  entre cuentas conservando sumas, rechazo de cuenta vacía y etiqueta no canónica,
  y aceptación de diagnósticos reales de migración de cuenta o registro huérfano.
- Registrado en el gate obligatorio de matrices de navegador desktop/móvil.

## Estado de seguridad y publicación
No cambia consultas SQL, huellas financieras, filas bancarias ni APIs en producción.
Sólo endurece la validación del informe público y añade evidencia automática.
Este commit es candidato: requiere CI propia terminal; no hereda 87 SUCCESS + 1 SKIPPED
del HEAD anterior `ee492cdd`. G5 OCR privada y AP1/AP2/AP5/AP7/AP8 continúan sin cerrar.

Supabase consultado con SELECT en transacción read-only el 23/10: 3.188 source records
con 3.188 identidades distintas, cero huellas malformadas y 134 saldos NULL; 3.188
transacciones financieras. Trigger `documents_private_original_rewrite_guard` productivo
no instalado (0), gateway activo v86. Sin SQL mutante, sync real, merge o despliegue.
