# Arquitectura canónica — Finanzas 3.0 V2.0.1

## Flujo principal

`Google Drive / XLSX maestro (solo lectura)` → `Supabase Edge: finanzas-v3-bridge` → `finance_v3_current + snapshots` → `Next.js en Vercel`.

La aplicación combina esa fuente con la capa privada almacenada en Supabase:
- `finance_v3_movement_overrides`
- `finance_v3_movement_splits`
- `finance_v3_budgets`
- `finance_v3_goals`
- `finance_v3_future_events`
- `finance_v3_scenarios`
- `finance_v3_recurring_preferences`
- `finance_v3_audit`

## Frontera de confianza

El navegador nunca recibe credenciales de Google ni `SUPABASE_SERVICE_ROLE_KEY`. Next.js conserva una cookie privada de sesión y llama a Edge Functions con el token de aplicación. Las Edge Functions validan ese token y son las únicas que usan service-role para operar sobre las tablas V3.

## Edge Functions exclusivas de V3

- `finanzas-v3-bridge` v4: login, lectura/validación de fuente, caché y snapshots.
- `finanzas-v3-data` v2: overrides, presupuestos, objetivos, eventos futuros y escenarios.
- `finanzas-v3-recurring` v1: preferencias de recurrencias.
- `finanzas-v3-splits` v1: divisiones de movimientos y validación transaccional vía RPC.

Todas tienen `verify_jwt=false` porque utilizan autenticación personalizada de compatibilidad. Esto no significa acceso público: el cuerpo de cada función exige el token privado de aplicación antes de leer/escribir.

## Dependencia legada controlada

La validación del token mantiene compatibilidad con `finanzas-alberto-api` v5. Ese servicio es compartido y no se versiona en este repositorio porque contiene configuración sensible legada que debe migrarse y rotarse en un trabajo aislado. V5 resuelve el probe de sesión dentro de Supabase y evita el salto histórico a Cloudflare.

## Capa Next.js

- App Router, Next.js 16.3.1, React 19.2.8.
- Node 22.x.
- Región Vercel: `cdg1` para acercar ejecución a Supabase `eu-west-3`.
- Rutas privadas protegidas por `proxy.ts`.
- `loadValidatedSource()` deduplica la lectura por request mediante React `cache`.
- `src/sync/google-sheets.ts` mantiene una caché corta en proceso y deduplica peticiones concurrentes de `/source`.
- Las páginas que requieren varias capas independientes usan `Promise.all`.

## Dominio financiero

`src/domain/*` contiene cálculos puros: cash flow, balances, presupuestos, calidad, recurrentes, previsiones, informes, patrimonio e insights. `src/private-data/merge.ts` construye la vista efectiva sin modificar el original.

## Escalabilidad

V2.0.1 limita el DOM de Movimientos a bloques de 100 manteniendo búsqueda sobre el histórico actual. Para 100k+ movimientos, la ruta objetivo es activar las tablas normalizadas ya existentes en Supabase (`finance_source_transactions`, enrichments, accounts, etc.) y trasladar búsqueda/paginación/agregados al servidor. Esa migración debe ejecutarse en paralelo al snapshot actual y con comparación de totales antes de cortar tráfico.
