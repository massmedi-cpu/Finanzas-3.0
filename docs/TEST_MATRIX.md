# Matriz de pruebas — Financial App 6.0.0

## Gate automatizado obligatorio

Cada commit/PR candidato ejecuta en GitHub CI, sin crear deployments de Vercel:
1. instalación reproducible con `npm ci`;
2. coherencia de manifest y lockfile;
3. auditoría de dependencias;
4. regresiones financieras y documentales;
5. OCR PP-OCRv6 y reconstrucción física del ticket;
6. TypeScript y código no utilizado;
7. AXIOMA y arquitectura canónica;
8. contratos RPC y fronteras API;
9. gates 5.0.0, 5.0.1 y 6.0.0;
10. auditoría visual de las superficies reformadas;
11. accesibilidad;
12. preflight Supabase de candidato sobre la baseline activa;
13. build de producción;
14. reproducibilidad del release.

## Regresiones de dominio

| Área | Prueba | Resultado esperado |
|---|---|---|
| Cash Flow | traspaso interno | excluido de ingresos/gastos |
| Cash Flow | transferencia externa | permanece como gasto/ingreso real |
| Previsión | evento esperado | calendario y proyección coherentes |
| Duplicados | dos operaciones idénticas | un grupo candidato |
| Capa privada | categoría corregida | prevalece sobre fuente/regla |
| Objetivos | ritmo insuficiente | aportación requerida y déficit correctos |
| Horizonte | escenario largo | cálculo no truncado por la vista |
| Cierre | pendientes/no conciliados | cierre bloqueado |
| Cierre | drift posterior | exige reapertura/revisión |
| Reglas | coincidencia automática | regla aplicada sin pisar manual |
| Reglas | override manual | manual gana a regla |
| Explicabilidad | sugerencia conservadora | requiere revisión antes de crear regla |
| Auditoría | checksum/filas divergentes | estado error |
| Backup | esquema/checksum incompatible | restore bloqueado |
| Backup | round-trip válido | capa privada restaurada exactamente |
| OCR | ticket legible | una inferencia PP-OCRv6, geometría preservada y validación estricta |
| Archivo | archivar/desarchivar | reversible sin alterar valores o enlaces |

## Gate de integridad financiera

- Los cálculos antes/después deben conservar los mismos movimientos y resultados salvo correcciones funcionales documentadas.
- Traspasos internos, duplicados y ahorro mantienen su semántica validada.
- Ediciones, splits y reglas conservan precedencia `split > manual > regla > fuente`.
- La migración documental 6.0.0 es idempotente y no modifica movimientos ni asociaciones documento–movimiento.
- La migración de release 6.0.0 no modifica tablas financieras.

## Gate visual y responsive

- No existe microtexto UI inferior a 14 px en las 25 superficies reformadas.
- No se reintroduce `!important` como capa correctiva.
- Navegación principal: Inicio, Cash Flow, Movimientos, Análisis y Archivo, exactamente en ese orden.
- Sidebar en escritorio y bottom navigation en móvil.
- Objetivos táctiles críticos de al menos 44 px.
- Modo claro/oscuro, foco visible y `prefers-reduced-motion` protegidos.

## Gate de seguridad

- Google OAuth + allowlist es el único flujo interactivo de acceso.
- No existe ruta `/auth/preview`, script E2E de Preview ni Edge Function activa de sesión Preview en el código.
- `financial_app_claim_preview_login` y `financial_app.preview_login_tokens` quedan retirados por el cierre 6.0.0.
- Service role y credenciales Google nunca llegan al navegador.
- APIs privadas responden 401 sin sesión y rutas privadas redirigen al login.
- RLS, privilegios y funciones privilegiadas permanecen cubiertos por gates/advisors.

## Gate de publicación directa

No existe preview intermedia.

1. El HEAD candidato debe tener GitHub CI completamente verde.
2. Supabase de producción permanece en la baseline activa mientras se desarrolla.
3. Al publicar, se aplica únicamente la migración de release necesaria y se ejecuta `preflight:supabase:release` exacto.
4. Se fusiona a `main`; `vercel.json` impide que cualquier otra rama genere deployments.
5. Vercel construye directamente producción con recursos gratuitos disponibles.
6. El smoke espera `X-Financial-App-Version` igual a la `APP_VERSION` del commit fusionado, evitando validar accidentalmente el deployment anterior.
7. Se comprueban en `financialapp-home.vercel.app` Inicio, Cash Flow, Movimientos, Análisis, Archivo, Configuración y APIs privadas.
8. Se revisan errores runtime nuevos tras el deployment.

## Principio de fallo

Si falta una capa requerida para exactitud, seguridad o coherencia, la publicación se detiene. No se sustituyen datos reales por mocks ni se relajan gates para conseguir un build verde.
