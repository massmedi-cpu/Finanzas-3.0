# PRE-033 · cobertura de certificación de Previsión · 01/10/2026

## Resultado

La auditoría posterior a Financial App 10.0.50 no ha encontrado una regresión funcional reproducible en Previsión. Sí ha identificado un hueco de CI: el workflow moderno de integridad de Previsión sólo reaccionaba a UI/API/selección y tests, mientras que el cálculo y la persistencia reales dependen también del gateway Vercel→Supabase, `forecast-logic.ts`, el contexto de workspace y varias migraciones SQL del motor.

Al mismo tiempo existía `Forecast Premium Targeted E2E`, pero estaba limitado a la rama histórica `work/premium-forecast-intelligence`; por tanto no protegía cambios futuros en `main` ni en PR normales.

## Corrección

PRE-033 consolida la certificación en `Forecast Period Integrity Certification`:

- se ejecuta en PR cuando cambian UI/API de Forecast, selección, diseño Forecast, gateway de persistencia, Edge Function del gateway y las migraciones SQL específicas del motor Forecast;
- se ejecuta también en `main` sobre esos mismos caminos;
- añade a la batería existente las regresiones visuales `visual-system-forecast.spec.ts` y `premium-forecast-visual.spec.ts`;
- mantiene typecheck, build y ejecución desktop + mobile;
- retira el workflow branch-only histórico para que no exista una falsa sensación de cobertura paralela.

## Fuentes de runtime protegidas explícitamente

- `app/forecast/**`
- `app/api/forecast/**`
- `src/application/forecast/**`
- `src/design/forecast-**`
- `src/infrastructure/persistence/vercel-supabase-gateway.ts`
- `supabase/functions/financial-app-db-gateway/forecast-logic.ts`
- `supabase/functions/financial-app-db-gateway/workspace-context.ts`
- `supabase/functions/financial-app-db-gateway/index.ts`
- migraciones Phase 8 Forecast, PRE-007 write integrity y FK workspace de Forecast.

## Decisión de versión

No se abre Financial App 10.0.51. Este bloque endurece la certificación pero no cambia el comportamiento del producto, los datos ni el esquema desplegado.

## Producción

Producción permanece en Financial App 10.0.50. Vercel Git continúa cerrado. No hay deployment ni cambio de configuración de Producción asociado a PRE-033.

## Guardrails

- `bankSource=read_only`
- `financialWrites=false`
- `requiresHumanReview=true`
