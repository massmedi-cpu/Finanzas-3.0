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

## REC-POST-351 · Regresión real detectada por CI y reparada
El workflow `Source Trust CI Gates` sobre SHA `0623626d` ejecutó REC-POST-350,
que mostró un rechazo erróneo de informes `blocked` cuando una misma fila
pasaba de la cuenta original A a una cuenta persistida B. El límite previo
`accounts.length <= sourceRows + orphanRows` sólo contaba grupos de origen
y filas huérfanas, ignorando que una fila discrepante puede generar una
cuenta persistida adicional. **No** era evidencia de modificación bancaria.

Se refuerza el límite matemático sin permitir cuentas fantasma:
`accounts.length <= sourceRows + orphanRows + differingRows`. Se conservan
los controles nuevos REC-POST-350: cuentas sin filas prohibidas, cada
`matchingRows + orphanRows <= persistedRows`, etiquetas públicas consecutivas,
sumas exactas e integridad de los estados. La regresión independiente
REC-POST-351 exige un diagnóstico `blocked` genuino, dos grupos permitidos
y ausencia de claves de cuenta en la respuesta pública.

Nueva HEAD requiere CI completa; los resultados de `0623626d` no se
atribuyen al nuevo commit. Producción, OCR reservado, SQL, fuente bancaria
y gateway permanecen intactos.
