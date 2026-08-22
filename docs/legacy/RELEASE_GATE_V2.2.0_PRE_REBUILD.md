# Release Gate — Finanzas 3.0 V2.2.0

> Documento histórico previo al rebuild actual. No describe Financial App 2.2.0 vigente.

## Alcance

V2.2.0 completa la migración del núcleo analítico de Informes, Presupuestos y Centro de revisión al modelo SQL normalizado iniciado en V2.1.0.

No modifica la fuente bancaria original ni sustituye las tablas privadas V3 de edición.

## Gates obligatorios

### Exactitud financiera

- Snapshot actual y normalizado deben permanecer sincronizados por `row_count` y checksum.
- La comparación independiente snapshot → analytics debe dar igualdad en movimientos, traspasos, ingresos y gastos.
- Validación de referencia 2026: 286 movimientos; 21 traspasos excluidos; ingresos 11.303,83 €; gastos 9.749,05 €.
- Validación 2026-08: ingresos 20,73 €; gastos 728,31 €.

### Seguridad

- `finance_v220_*` no puede ser ejecutable por `PUBLIC`, `anon` ni `authenticated`.
- La Edge Function analítica debe exigir una sesión privada válida antes de devolver datos.
- `service_role` no puede aparecer en el navegador ni en el repositorio.

### Rendimiento y arquitectura

- Informes, Presupuestos y Centro de revisión no vuelven a cargar la fuente completa.
- Se mantiene el data plane paginado de Movimientos de aquella arquitectura.

### Producción histórica

El documento exigía preview, healthcheck y promoción de aquella base. Esos pasos no son aplicables al rebuild actual y se conservan solo como evidencia histórica.
