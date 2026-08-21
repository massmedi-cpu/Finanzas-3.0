# Release gate — V2.6.0

## Datos y exactitud

- [x] 3.135 movimientos antes/después sin reglas.
- [x] 0 diferencias de categoría/subcategoría/merchant en muestra inicial de 200 sin reglas.
- [x] Totales 2026 conservados: ingresos 11.303,83 €, gastos 9.749,05 €, neto 1.554,78 €.
- [x] 21 traspasos siguen excluidos.
- [x] Reglas no modifican la fuente.
- [x] Overrides manuales tienen prioridad.
- [x] Splits conservan prioridad de categoría.

## Reglas

- [x] Preview read-only.
- [x] Guardar bloqueado si el formulario cambió desde el preview.
- [x] Cuenta y dirección opcionales.
- [x] Prioridad determinista.
- [x] Pausar/desactivar reversible.
- [x] Eliminar reversible sobre movimientos.
- [x] Auditoría de create/update/enable/disable/delete.

## Seguridad

- [x] RLS habilitado.
- [x] Sin acceso directo anon/authenticated.
- [x] service_role solo backend Supabase.
- [x] Rutas Next privadas protegidas por proxy/smoke.
- [x] Sin regex arbitraria.

## Regresiones

- [x] Prueba transaccional real regla → manual override → limpieza.
- [x] Domain tests de matching/prioridad/precedencia.
- [ ] HEAD final CI completo verde.
- [ ] Preview Vercel único READY cuando se reactive el cupo.
- [ ] Runtime autenticado final.
- [ ] Promoción a producción.

Los tres últimos gates permanecen pendientes hasta el release acumulado acordado; no deben forzarse mediante previews intermedios.
