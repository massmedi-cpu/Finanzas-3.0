# Financial App 1.0.0-rc.1 — Objetivos financieros

## Alcance

Bloque mayor de planificación personal añadido sobre `financial-app-rebuild`.

- Objetivos de ahorro, compra, fondo de emergencia u otro.
- Importe objetivo, prioridad, fecha opcional y notas.
- Progreso manual explícito o progreso vinculado al último saldo bancario real de una cuenta.
- El saldo bancario original nunca se modifica.
- El porcentaje de progreso no puede ser negativo; un saldo negativo sigue mostrándose como dato real y aporta 0 € al progreso.
- Cálculo de importe restante y aportación mensual necesaria cuando existe fecha objetivo.
- Estados: conseguido, en plazo, exige atención, fecha superada, sin fecha límite y falta saldo real.
- La referencia de capacidad utiliza la media del cash flow neto de los tres últimos meses cerrados; se muestra como referencia, nunca como promesa de ahorro.
- Historial de creación, edición y archivado para mantener trazabilidad y reversibilidad.

## Seguridad

Las tablas `financial_app.goals` y `financial_app.goal_history` tienen RLS activado y privilegios directos revocados para `public`, `anon` y `authenticated`. Las operaciones se exponen únicamente mediante las RPC autorizadas ya usadas por Financial App.

## UX

Nueva sección `/objetivos`, integrada en la navegación entre Presupuesto y Previsión, responsive y con estados de vacío, carga, error y edición.

## Validación requerida antes de cerrar

1. esquema/RLS y permisos;
2. RPC y cálculos;
3. typecheck y build;
4. Preview Vercel READY;
5. revisión visual desktop/móvil;
6. advisors de seguridad y rendimiento.
