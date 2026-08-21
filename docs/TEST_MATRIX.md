# Matriz de pruebas — Finanzas 3.0

## Gate automatizado obligatorio

Cada commit/PR de desarrollo o release ejecuta:
1. instalación bloqueada con `npm ci`;
2. invariantes del proyecto;
3. regresiones financieras base;
4. horizonte largo;
5. cierre mensual;
6. reglas de clasificación;
7. explicabilidad;
8. auditoría del sistema;
9. portabilidad/backup;
10. seguridad V3.0 fail-closed;
11. TypeScript;
12. build de producción;
13. arranque del build real;
14. smoke HTTP del servidor compilado.

## Regresiones de dominio

| Área | Prueba | Resultado esperado |
|---|---|---|
| Cash flow | Traspaso interno | excluido de ingresos/gastos |
| Cash flow | Transferencia bancaria externa | permanece como gasto/ingreso real |
| Duplicados | dos operaciones idénticas | un grupo candidato |
| Capa privada | categoría corregida | desaparece alerta correspondiente |
| Objetivos | ritmo insuficiente | aportación requerida y déficit correctos |
| Horizonte | escenario 60 meses | no se trunca a 12/24 meses |
| Cierre | pendientes/no conciliados | cierre bloqueado |
| Cierre | drift posterior | exige reapertura/revisión |
| Reglas | coincidencia automática | regla aplicada sin pisar manual |
| Reglas | override manual | manual gana a regla |
| Explicabilidad | sugerencia conservadora | requiere preview antes de crear regla |
| Auditoría | checksum/filas divergentes | estado error |
| Backup | esquema/checksum incompatible | restore bloqueado |
| Backup | round-trip válido | capa privada restaurada exactamente |
| Seguridad | probe 5xx/fallo de red | acceso denegado |

## Gate de datos normalizados
- `currentRows == normalizedRows`.
- checksum snapshot/normalizado idéntico.
- sincronización idempotente.
- traspasos excluidos con la semántica validada.
- overlays/splits/reglas resueltos con precedencia `split > manual > regla > fuente`.

## Gate de rendimiento
- Movimientos conserva paginación keyset/cursor.
- Superficies protegidas no pueden usar `loadValidatedSource`.
- Analítica principal usa RPC agregados.
- Previsión proyecta por ventanas y limita el detalle visual sin truncar cálculo.
- FK de eventos de reglas tiene índice de cobertura V3.0.

## Gate de seguridad V3.0
- `finanzas-v3-data`, `finanzas-v3-recurring` y `finanzas-v3-splits` no contienen autorización fail-open.
- 2xx/404 autenticado esperado son los únicos resultados válidos del probe legado.
- 401/403, 5xx y excepciones deniegan acceso.
- Service role y credenciales Google solo existen en backend.
- RLS deny-by-default preservado.

## Smoke del servidor compilado
Comprueba sin sesión:
- `/api/health` 200 y versión exacta;
- rutas privadas redirigen a `/login`;
- APIs privadas inaccesibles;
- `/login` renderiza formulario;
- manifest/icono/robots;
- cabeceras de seguridad;
- ausencia de `X-Powered-By`.

Incluye las superficies V3: Cierre, Reglas, Explicabilidad, Control y Copias.

## Gate Vercel/producción
- un único preview del HEAD final V3.0.0;
- deployment READY en región configurada;
- health `3.0.0`;
- sin errores/fatales runtime;
- promoción posterior a `main`;
- deployment producción del SHA fusionado;
- health producción `3.0.0` y navegación crítica funcional.

## Principio de fallo
Si falta una capa requerida para exactitud o seguridad, la aplicación debe mostrar error explícito y no cifras parciales ni restauraciones parciales.
