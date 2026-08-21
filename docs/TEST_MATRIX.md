# Matriz de pruebas — Finanzas 3.0 V2.0.1

## Gate automatizado obligatorio

Cada commit de `audit/**`, `develop/**` y cada PR a `main` ejecuta:
1. `npm ci --no-audit --no-fund`
2. `npm test`
3. `npm run typecheck`
4. `npm run build`

## Regresiones de dominio cubiertas

| Área | Prueba | Resultado esperado |
|---|---|---|
| Cash flow | Traspaso interno | excluido de ingresos/gastos |
| Cash flow | Transferencia bancaria externa | permanece como gasto/ingreso real |
| Resumen mensual | ingreso + gasto + traspaso | totales y neto correctos |
| Duplicados | dos operaciones idénticas | un grupo candidato |
| Saldos | dos registros mismo día | conserva el primero del orden descendente validado |
| Capa privada | categoría corregida | desaparece alerta “sin categoría” |
| Capa privada | movimiento excluido | no participa en calidad/analítica |
| Seguridad sesión | token ausente/malformado/caducado | proxy redirige a login |

## Comprobaciones manuales de release

- Login y logout.
- Inicio, Movimientos, Presupuestos, Recurrentes, Previsión, Informes, Revisión, Objetivos y Plan.
- Editar/restaurar un movimiento.
- Dividir/restaurar un movimiento.
- Guardar presupuesto, recurrencia, objetivo, evento futuro y escenario.
- Confirmar que una edición privada se refleja en Inicio/Revisión/Informes.
- Responsive a ancho móvil y escritorio.
- Navegación repetida sin peticiones masivas de prefetch.
- Prueba A/B de rendimiento sobre la misma fuente y secuencia de navegación antes de promover una optimización de rendimiento.

## Gate de datos

Si falla fuente, estado privado, splits o preferencias recurrentes y esa capa afecta al cálculo de la pantalla, la prueba esperada es **error explícito y ausencia de cifras parciales**.
