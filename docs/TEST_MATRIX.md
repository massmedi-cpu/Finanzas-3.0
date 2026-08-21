# Matriz de pruebas — Finanzas 3.0

## Gate automatizado obligatorio

Cada commit de `audit/**`, `develop/**` y cada PR a `main`/`develop/**` ejecuta:
1. `npm ci --no-audit --no-fund`
2. `npm run audit:invariants`
3. `npm test`
4. `npx tsx scripts/long-horizon-tests.mjs`
5. `npm run typecheck`
6. `npm run build`
7. arranque del build real con `next start`
8. `npm run test:smoke`

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
| Objetivos | ritmo insuficiente | calcula aportación requerida y déficit mensual |
| Objetivos | meta completada/en plazo/sin plan | estado determinista correcto |
| Alertas | liquidez/objetivos/calidad | prioridad, evidencia y destino correctos |

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

## Gates específicos V2.4.0

| Área | Evidencia requerida |
|---|---|
| Horizonte | 1–60 meses, normalizado y acotado |
| Escenarios | máximo horizonte activo determina la proyección base |
| Recurrencias | patrón mensual de 60 meses no puede truncarse a 24 ocurrencias |
| Planificados | evento mensual cubre los 60 meses completos |
| Ventanas | proyección en tramos de 12 meses sin IDs duplicados |
| Límites | ningún movimiento sale antes de `fromDate` ni después de `horizonDate` |
| Capacidad de objetivos | usa el horizonte real del escenario, sin tope artificial de 12 meses |
| Calendario mensual | ingresos, gastos, neto, saldo arrastrado y fecha de negativo correctos |
| Vista anual | agregación por año conserva cash flow, saldo y número de movimientos |
| Regresión | `app/prevision/page.tsx` debe seguir usando `buildLongHorizonForecast` |
| Vercel | ramas de desarrollo no consumen previews automáticos; preview único al cierre |

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
- Validar escenario de 12, 24, 36 y 60 meses.
- Validar calendario financiero mensual y resumen anual de largo plazo.
- Responsive móvil/escritorio.
- Navegación repetida sin peticiones masivas.
- Benchmark A/B cuando se cambia una ruta de datos importante.

## Gate de datos

Si falla una capa necesaria para la exactitud, el resultado es **error explícito y ausencia de cifras parciales**. V2.1 añade como condición que snapshot y normalizado deben estar sincronizados antes de servir superficies migradas.
