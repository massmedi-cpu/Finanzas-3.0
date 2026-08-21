# Financial App — Arquitectura 0.1.0

## Principios

- El Prompt Maestro Axioma es la especificación rectora.
- GitHub `main` permanece estable; el trabajo de reconstrucción vive en `financial-app-rebuild` hasta validación.
- Vercel es la plataforma de Preview/Production.
- PostgreSQL/Supabase es la base operativa.
- Google Sheets `Movimientos bancarios - fuente` es estrictamente de solo lectura.
- La lógica financiera se centraliza en `lib/financial/rules.ts`.

## Fuente bancaria verificada

- Spreadsheet ID: `1OT4QFeRDAchLkznnQvmAe3SslDVXDm1JXU_kIGIhtV8`
- Locale: `es_ES`
- Timezone: `Europe/Madrid`
- Hoja `Cuenta corriente · 3967`: 22 columnas.
- Hoja `Cuenta ahorro · 2504`: 22 columnas.
- Identificador primario de sincronización: `ID origen`.

## Base de datos

Se usa el esquema privado `financial_app`, separado de las aplicaciones anteriores. `anon` y `authenticated` no tienen privilegios directos sobre el esquema. El acceso a datos deberá realizarse únicamente desde servidor tras validar sesión y autorización.

Tablas núcleo:

- `allowed_users`
- `accounts`
- `sync_runs`
- `transactions`
- `transaction_history`
- `transaction_splits`
- `budgets`
- `forecasts`
- `documents`
- `transaction_documents`
- `preferences`
- `app_meta`

## Regla de Cash Flow

Un movimiento no computa si pertenece a la cuenta de ahorro, es entre cuentas, es duplicado o está expresamente excluido. Esta regla no se replica en componentes visuales.

## Estado

Versión de construcción: `0.1.0`.

Completado: análisis de fuente, aislamiento de rama, esquema de base de datos, shell responsive, menú oficial, núcleo inicial de reglas.

Pendiente antes de producción: Google OAuth/OIDC, autorización server-side, sincronización incremental, importación inicial, pruebas automatizadas, datos reales en UI, Preview y verificación completa.
