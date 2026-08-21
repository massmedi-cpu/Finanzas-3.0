# Matriz de pruebas — Finanzas 3.0

## Gate automatizado obligatorio

Cada commit de `audit/**`, `develop/**` y cada PR a `main` ejecuta:
1. `npm ci --no-audit --no-fund`
2. `npm run audit:invariants`
3. `npm test`
4. `npm run typecheck`
5. `npm run build`
6. arranque del build real con `next start`
7. `npm run test:smoke`

Cada `push` a `main` ejecuta además un smoke contra producción y espera a que `/api/health` publique exactamente la versión del commit.

## Regresiones de dominio

| Área | Prueba | Resultado esperado |
|---|---|---|
| Cash flow | Traspaso interno | excluido de ingresos/gastos |
| Cash flow | Transferencia bancaria externa | permanece como gasto/ingreso real |
| Resumen mensual | ingreso + gasto + traspaso | totales y neto correctos |
| Duplicados | dos operaciones idénticas | un grupo candidato |
| Saldos | dos registros mismo día | conserva el orden validado |
| Capa privada | categoría corregida | desaparece alerta “sin categoría” |
| Capa privada | movimiento excluido | no participa en calidad/analítica |
| Seguridad sesión | token ausente/malformado/caducado | proxy redirige a login |

## Gates específicos V2.1.0

| Área | Evidencia requerida |
|---|---|
| Normalización | `currentRows == normalizedRows` y checksum idéntico |
| Idempotencia | segunda sync: 0 insertados/actualizados, todos unchanged |
| Exactitud histórica | 0 diferencias por mes entre snapshot y normalizado |
| Resumen | mes, ingresos, gastos, neto, patrimonio, movimientos y revisión idénticos |
| Paginación | páginas consecutivas sin IDs solapados |
| Búsqueda | búsqueda texto/importe devuelve resultados sin cargar histórico completo |
| Escalabilidad | Movimientos mantiene página máxima de 100 en UI y 200 en API |
| Seguridad | RPC V2.1 solo service-role; browser no recibe secretos |
| Arquitectura | Movimientos/Cuentas/FinancialSummary/SourceHealth no importan `loadValidatedSource` |
| Preview | commit exacto READY en `cdg1`, sin errores runtime |

## Smoke del servidor compilado

Comprueba sin credenciales privadas:
- `/api/health`: 200, aplicación y versión exacta;
- `/` y rutas privadas: redirección a `/login`;
- APIs privadas no accesibles sin sesión;
- preservación segura de `next`;
- `/login`: formulario en el primer HTML;
- manifest, icono y robots disponibles;
- robots bloquea indexación;
- cabeceras de seguridad y ausencia de `X-Powered-By`.

## Comprobaciones funcionales de release

- Login/logout reales.
- Inicio, Movimientos, Cuentas, Presupuestos, Recurrentes, Previsión, Informes, Revisión, Objetivos y Plan.
- Editar/restaurar movimiento.
- Dividir/restaurar movimiento.
- Guardar presupuesto, recurrencia, objetivo, evento futuro y escenario.
- Confirmar que una edición privada se refleja en las superficies derivadas.
- Responsive móvil/escritorio.
- Navegación repetida sin peticiones masivas.
- Benchmark A/B cuando se cambia una ruta de datos importante.

## Gate de datos

Si falla una capa necesaria para la exactitud, el resultado es **error explícito y ausencia de cifras parciales**. V2.1 añade como condición que snapshot y normalizado deben estar sincronizados antes de servir superficies migradas.
