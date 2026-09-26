# Financial App 10.0.5 · experiencia premium y previsión coherente

## Alcance

- Integra el sistema visual premium de PRE-026 sobre la base actual 10.0.4, sin revertir la conciliación de Inicio ni el formato monetario común.
- Da a Inicio un estado explícito cuando la previsión no contiene movimientos. El neto de cero y el saldo de referencia ya no se presentan como proyección; tampoco se emite una alerta de cierre por una previsión inexistente.
- Ofrece acciones directas para revisar recurrencias o añadir una previsión manual desde el estado vacío.
- Reutiliza el parser monetario central en el formulario de previsión, incluido el límite de enteros seguros.
- Mantiene accesibilidad de foco, contraste forzado, movimiento reducido y color de instalación coherente.

## Auditoría de datos de producción (solo lectura, 26/09/2026)

| Comprobación | Resultado |
| --- | --- |
| Movimientos y registros de origen | 3.183 y 3.183 |
| Identidades de movimiento duplicadas, referencias huérfanas y desacuerdos de origen | 0, 0 y 0 |
| Ajustes manuales guardados antes de la última sincronización completada y conservados después | 2 de 2 |
| Resumen mensual frente a periodo para ingresos, gastos y neto | Coinciden |
| Saldo activo frente a la suma de cuentas activas | Coincide |
| Diferencias de reconstrucción bancaria conocidas | 1 cuenta; prevalece el saldo explícito de la fuente |
| Recurrencias activas / totales | 0 / 14 |
| Elementos de previsión almacenados y previstos en la consulta | 0 y 0 |
| Límites de presupuesto guardados | 0; el módulo puede mostrar referencias automáticas sin inventar objetivos |

## Verificaciones antes de integrar

- `npm run typecheck`
- `npm run build` y comprobación posterior de runtime de fuente (local)
- Contratos de versión, formato, consistencia y sistema visual: 7 pruebas sin navegador.
- Pendiente de los trabajos de CI y comprobación de Preview de la SHA exacta: navegación, formularios, estados vacíos y anchos desktop/móvil.

## Seguimiento de permisos de base de datos

Cinco tablas de control de `financial_app` tienen RLS desactivado. La comprobación de privilegios constató que `anon` y `authenticated` no tienen `SELECT` ni `INSERT` sobre ellas; no hay evidencia de lectura directa por esos roles. Se debe diseñar la política de RLS con pruebas de acceso y verificar las funciones internas antes de cambiar permisos en producción.
