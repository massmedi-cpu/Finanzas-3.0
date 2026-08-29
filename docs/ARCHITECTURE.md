# Financial App 5.0.0 — Arquitectura vigente

`docs/CANONICAL_ARCHITECTURE.md` es la referencia normativa. Este documento describe el flujo operativo actual con suficiente detalle para mantenimiento y auditoría.

## 1. Flujo de datos

`Google Drive / fuente financiera externa (solo lectura)` → `financial-app-sync` → esquema privado `financial_app` → motores SQL/RPC canónicos → loaders de servidor Next.js → UI privada en Vercel.

La aplicación nunca escribe en la fuente bancaria o documental original. Los enriquecimientos privados se almacenan aparte y son trazables.

## 2. Sincronización

La Edge Function `financial-app-sync` comprueba el estado de la fuente y procesa únicamente cambios relevantes. La sincronización:

- es incremental;
- evita reparseos cuando Drive no cambia;
- preserva IDs y procedencia;
- no elimina originales de Google Drive;
- registra ejecuciones y resultados para Control/Inicio;
- no se dispara automáticamente al montar Inicio.

La actualización manual refresca la UI únicamente cuando la sincronización informa de cambios reales.

## 3. Identidad y frontera de confianza

- Google OAuth autentica al usuario.
- La autorización privada se valida en servidor mediante la allowlist vigente.
- El navegador utiliza únicamente la clave publicable de Supabase.
- `service_role` y secretos Google permanecen en servidor/Edge Functions.
- Las superficies sensibles validan sesión y autorización antes de leer o mutar datos privados.

## 4. PostgreSQL y RPC

El esquema `financial_app` contiene tablas y funciones internas. Los wrappers `public.financial_app_*` forman la API SQL que consume la aplicación cuando corresponde.

Regla 5.0: cada responsabilidad runtime tiene una única superficie canónica. Las funciones sustituidas se eliminan con `DROP ... RESTRICT`, nunca con `CASCADE`.

### Inicio

- Ruta crítica: `public.financial_app_home_pulse(date)` → `financial_app.home_pulse_core(date)`.
- Cuentas: `public.financial_app_accounts(...)` a través de `getAccountsOverview()`.
- Las secciones secundarias se resuelven en paralelo/streaming.

Retirado en 5.0.0:

- `public.financial_app_dashboard(date)`;
- `financial_app.dashboard_rpc(date)`;
- `public.financial_app_home_overview()`;
- `financial_app.home_overview_core()`;
- `lib/financial/dashboard.ts`;
- `lib/financial/home.ts`.

Estas implementaciones permanecen únicamente en migraciones históricas anteriores a 5.0, no en runtime.

## 5. Motores financieros

- Movimientos: consulta paginada, edición individual/masiva, splits y reglas con historial y reversibilidad.
- Cash Flow: agregación canónica excluyendo duplicados, traspasos internos y movimientos fuera del contrato financiero.
- Presupuesto y Plan: motores de servidor reutilizados por UI; no se recalculan cifras con fórmulas paralelas en cliente.
- Previsión: calendario/ledger, matching 1↔1 con movimientos reales, descartes reversibles y proyección mensual de servidor.
- Agenda Financiera 7.0: `financial_app_forecast_liquidity` reutiliza el calendario visible canónico, parte de saldos operativos reales y proyecta solo compromisos todavía no confirmados. Produce saldo diario futuro, mínimo, hitos 30/60/90, días bajo cero y confianza sin mutar datos.
- Simulador de Decisiones 8.0: `financial_app_forecast_scenario` reutiliza directamente la liquidez 7.0 y superpone hipótesis efímeras. Admite gasto/ingreso puntual, recurrencias y cuotas, compara trayectoria base y simulada y no persiste ningún escenario.
- Conciliación: matching controlado y workbench de revisión.
- Inteligencia: anomalías, recurrencias, subidas y oportunidades derivadas de señales canónicas.
- Control: integridad, calidad de matching, sincronización, cierre y auditorías.

## 6. Documentos

- Archivo documental privado con originales externos preservados.
- Google Drive se trata como proveedor de almacenamiento/origen, no como una carpeta gestionada destructivamente por Financial App.
- Vinculación movimiento↔documento conservadora, con autoenlace únicamente cuando la evidencia es inequívoca.
- Casos ambiguos quedan visibles para revisión.
- OCR local/first-party se utiliza cuando hace falta extraer texto de tickets o imágenes.

## 7. Next.js

- App Router.
- Server Components por defecto y Client Components solo para interacción.
- `app/page.tsx` obtiene `getHomePulse()` en la ruta crítica y transmite cuentas/secciones independientes.
- `IntentLink` calienta rutas privadas por intención/touch sin reintroducir prefetch indiscriminado.
- La sincronización manual no bloquea la primera pintura.
- Previsión y Cash Flow cargan la proyección de liquidez como dato server-side y comparten `ForecastLiquidityDashboard`; las mutaciones explícitas del calendario invalidan la vista mediante `router.refresh()`.
- `/escenarios` carga como baseline la liquidez de 90 días en servidor. El cliente mantiene únicamente el borrador interactivo en memoria y POSTea a `/api/scenarios`; el cálculo real se resuelve en PostgreSQL mediante `forecast_scenario_core`.

## 8. Estilos y responsive

- Sistema visual común en hojas semánticas no versionadas.
- Cada módulo es propietario de sus estilos específicos.
- `forecast-liquidity.css` se carga únicamente en Previsión y Cash Flow.
- `app/escenarios/scenarios.css` se carga únicamente en la ruta del Simulador.
- Mobile-first y tablet/desktop responsive.
- Modo claro/oscuro y controles compartidos protegidos por gates de regresión.

## 9. Release y rollback

CI ejecuta AXIOMA, arquitectura actual, regresiones históricas, gate de la versión, seguridad de dependencias, lint, typecheck y build.

Una release se publica solo desde el mismo SHA que ha superado CI. Las previews automáticas permanecen bloqueadas. Tras el merge se comprueba el deployment de producción, se alinea la metadata Supabase y se ejecuta smoke HTTP del dominio canónico.

Las migraciones históricas se conservan para reconstrucción/auditoría. El rollback de código no implica reescribir la fuente financiera externa.

## 10. Baseline 5.0.0

5.0.0 es la baseline arquitectónica posterior a los bloques funcionales 4.0–4.5. A partir de aquí, cualquier evolución debe reutilizar las superficies canónicas existentes o sustituirlas de forma completa, eliminando la implementación anterior y actualizando sus gates forward-compatible.