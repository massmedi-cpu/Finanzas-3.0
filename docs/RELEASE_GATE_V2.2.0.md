# Release Gate — Finanzas 3.0 V2.2.0

## Alcance

V2.2.0 completa la migración del núcleo analítico de Informes, Presupuestos y Centro de revisión al modelo SQL normalizado iniciado en V2.1.0.

No modifica la fuente bancaria original ni sustituye las tablas privadas V3 de edición.

## Gates obligatorios

### Exactitud financiera

- Snapshot actual y normalizado deben permanecer sincronizados por `row_count` y checksum.
- La comparación independiente snapshot → analytics debe dar igualdad en movimientos, traspasos, ingresos y gastos.
- Validación de referencia 2026:
  - 286 movimientos;
  - 21 traspasos excluidos;
  - ingresos 11.303,83 €;
  - gastos 9.749,05 €.
- Validación 2026-08:
  - ingresos 20,73 €;
  - gastos 728,31 €.

### Seguridad

- `finance_v220_*` no puede ser ejecutable por `PUBLIC`, `anon` ni `authenticated`.
- La Edge Function analítica debe exigir una sesión privada válida antes de devolver datos.
- `service_role` no puede aparecer en el navegador ni en el repositorio.
- Sin nuevos avisos críticos o WARN de Supabase atribuibles a Finanzas 3.0.

### Rendimiento y arquitectura

- `app/informes/page.tsx`, `app/presupuestos/page.tsx` y `app/revision/page.tsx` no pueden volver a importar/cargar `loadValidatedSource`.
- Informes y Presupuestos deben recibir agregados, no las 3.135 operaciones completas.
- Centro de revisión debe recibir solo incidencias y movimientos relacionados.
- Se mantiene el data plane paginado de Movimientos de V2.1.0.

### CI

Deben pasar en el HEAD final:

1. `npm ci`
2. `npm run audit:invariants`
3. regresiones financieras
4. `npm run typecheck`
5. `npm run build`
6. smoke del build real

### Preview

- Deployment exacto del HEAD final en Vercel.
- Estado READY.
- Región `cdg1`.
- `/api/health` responde `version: 2.2.0`.
- Sin errores/fatales runtime.

### Producción

Solo después de todos los gates anteriores:

- merge con SHA protegido;
- deployment de `main` exacto;
- `/api/health` 200 y V2.2.0;
- revisión de errores runtime post-release;
- V2.1.0 se conserva como rollback lógico en Git.

## Evidencia previa al cierre

La primera integración funcional de Informes, Presupuestos y Revisión pasó el CI completo antes del bump de versión. La versión definitiva debe repetir todos los gates después de añadir documentación e invariantes V2.2.0.
