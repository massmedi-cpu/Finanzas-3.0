# Recuperación: integración y validación acumulativa

Esta candidata continúa RECUPERACION-PRODUCTO-20261009. No es una publicación ni aceptación del propietario. Mantiene abiertas AP1–AP8 y no modifica main, originales financieros ni infraestructura productiva.

## Base y continuidad

Se parte de `17bf1fc2c1069d2bda4a46b09124485daaa466c6`, que ya incorpora las correcciones de Inicio, Cash Flow, Previsión, temas y seguridad de interpretación OCR de las PR 565–569. Se integran las ramas completas de Presupuestos (#570, `6cea550128edb9a945270b4e7d5b52cf1aa872c2`), Alertas (#571, `2048e179809ca781c835a2bbab7a1f24187ba1d7`) y Cuentas (#572, `6f9f2d36dec3cbe835cb4cb3e9971f80fe963c55`). Las ramas originales se conservan.

El único conflicto de integración afecta a la guarda tipográfica §70. Se conserva la comprobación numérica de cuerpo >=1 rem y ayudas >=0,875 rem, sin rebajar legibilidad.

## Reproducción y corrección adicional

La nueva prueba del motor de Alertas falla antes del cambio: devuelve `1234 documentos sin asociar` en lugar de `1.234 documentos sin asociar`. El formateador independiente de Alertas no forzaba agrupación a cuatro cifras. Se sustituye por el formateador regional compartido; la fecha del siguiente pago también utiliza DD/MM/AAAA. No cambian importes, reglas de selección ni datos persistidos.

## Verificación de esta sesión

- Producción consultada mediante `/api/build`: versión 10.0.103, commit `6dad59c6c2db3575618a7c91c49c3060a93bbba1`, deployment `dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5`.
- Inicio real, en lectura: se reproduce la contradicción entre cobertura bancaria ausente y conclusión favorable del presupuesto. Se omiten cifras y datos personales en este documento público.
- Dependencias instaladas desde lockfile. TypeScript sin errores y build optimizada con guardas acumulativas aprobadas.
- 37 pruebas de lógica aprobadas: motor de Alertas, geometría temporal de Cash Flow/Previsión e interpretación financiera OCR. La nueva regresión falla antes y pasa después. Estas pruebas no certifican navegador, OCR real heterogéneo ni persistencia.
- La descarga local de Chromium no está disponible en este entorno. La matriz integrada se prepara en GitHub; su resultado no se da por aprobado anticipadamente.
- El workflow de recuperación añade regresiones de Cuentas, Presupuestos y Alertas en escritorio/móvil sobre la misma build optimizada y elimina una entrada duplicada de la suite de Inicio.

## Pendiente

Revisar la CI del commit remoto exacto, resolver fallos, inspeccionar visualmente la matriz y completar integración autenticada aislada. Continúan pendientes matriz completa del Axioma, mediciones de capacidad/API, corpus OCR reservado y puertas de publicación. El Gantt histórico no acredita la aceptación actual; no se calcula un porcentaje nuevo por número de pruebas o commits.
