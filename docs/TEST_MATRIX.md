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

Cada `push` a `main` ejecuta además un smoke contra `https://finanzas-3-0.vercel.app` y espera hasta que `/api/health` publique exactamente la versión del commit desplegado.

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

## Smoke del servidor compilado

El gate HTTP comprueba sin usar credenciales privadas:
- `/api/health`: 200, nombre de aplicación y versión exacta;
- `/` y rutas privadas: redirección a `/login` sin sesión;
- APIs privadas y `/api/sync/status`: no accesibles sin sesión;
- preservación segura del parámetro `next`;
- `/login`: formulario presente en el primer HTML y ausencia de bailout a renderizado exclusivamente cliente;
- `/manifest.webmanifest`, `/icon.svg` y `/robots.txt` disponibles;
- `robots.txt` bloquea indexación;
- cabeceras `nosniff`, `DENY`, `no-referrer`, Permissions-Policy y `noindex`;
- ausencia de `X-Powered-By`.

## Comprobaciones manuales de release

- Login y logout reales.
- Inicio, Movimientos, Presupuestos, Recurrentes, Previsión, Informes, Revisión, Objetivos y Plan.
- Editar/restaurar un movimiento.
- Dividir/restaurar un movimiento.
- Guardar presupuesto, recurrencia, objetivo, evento futuro y escenario.
- Confirmar que una edición privada se refleja en Inicio/Revisión/Informes.
- Responsive a ancho móvil y escritorio.
- Navegación repetida sin peticiones masivas de prefetch.
- Prueba A/B de rendimiento sobre la misma fuente y secuencia antes de promover una optimización de rendimiento relevante.

## Gate de datos

Si falla fuente, estado privado, splits o preferencias recurrentes y esa capa afecta al cálculo de la pantalla, el resultado esperado es **error explícito y ausencia de cifras parciales**.
