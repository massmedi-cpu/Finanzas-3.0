# Seguimiento de auditoría — Financial App 1.0.0-rc.1

Fecha: 2026-08-22
Rama canónica de trabajo: `financial-app-rebuild`

Este documento actualiza la auditoría inicial de RC1 sin sustituirla. La versión canónica del rebuild sigue siendo `1.0.0-rc.1`; los documentos V2/V3 heredados del repositorio pertenecen a la arquitectura anterior y no gobiernan este rebuild.

## Bloques ya cerrados desde la auditoría RC1

- Edición completa de movimientos con historial y restauración al origen.
- Divisiones de movimientos con interfaz propia y parte personal.
- Búsqueda y filtros avanzados: texto, ID, importe, OCR, cuenta, tipo, categoría, subcategoría, canal, etiquetas, revisión, recurrentes, traspasos, conciliación, documentos, divisiones, fechas e importes.
- OCR local real para imágenes y PDFs: PDF.js, Tesseract, PDFs híbridos, reconstrucción digital etiquetada, re-procesado y original privado.
- Tema claro/oscuro/sistema aplicado globalmente y restaurado antes del primer pintado.
- Simulador de escenarios y módulo de Objetivos disponibles en RC1.
- Acceso temporal seguro de Preview mediante ticket de un solo uso, sin rebajar la protección de producción.
- Auditoría y optimización de rendimiento de las consultas financieras principales con `pg_stat_statements` y `EXPLAIN (ANALYZE, BUFFERS)`.

## Regresión detectada en uso real de Preview y corregida

Se detectó `permission denied for function goals_overview_core` al abrir Objetivos. La causa era un desajuste de ACL: los wrappers públicos tenían permiso para `authenticated`, pero las tres funciones core de Objetivos solo concedían ejecución a `postgres`.

Corrección aplicada y validada:

- `financial_app.goals_overview_core()` → EXECUTE para `authenticated` y `service_role`.
- `financial_app.upsert_goal_core(...)` → EXECUTE para `authenticated` y `service_role`.
- `financial_app.deactivate_goal_core(uuid)` → EXECUTE para `authenticated` y `service_role`.
- `anon` continúa sin acceso.
- Validación con sesión `authenticated` y usuario allowlisted: resumen de Objetivos ejecutado correctamente; no se crearon ni modificaron objetivos reales.
- Auditoría preventiva de todos los wrappers `public.financial_app_*` que llaman a `financial_app.*_core`: no se detectaron otros desajustes equivalentes.

## Rendimiento validado en RC1

La medición histórica de `pg_stat_statements` mostró como cuellos de botella principales Conciliación, Análisis, Cash Flow y Presupuesto. Se optimizaron sin introducir caché de datos financieros y sin cambiar reglas de negocio.

Validaciones realizadas:

- `personal_financial_lines()`: de ~23,6 ms a ~8,0 ms; 0 filas distintas frente a la implementación anterior y eliminación de temporales en disco.
- Conciliación: de ~214 ms en benchmark equivalente a ~29,8 ms tras la corrección; el JSON de prueba fue exactamente igual al anterior.
- Cash Flow anual: de ~206 ms tras la primera mejora común a ~26,8 ms; JSON exactamente igual antes de aplicar la sustitución. Frente al histórico de uso real (~307 ms de media), la reducción es superior al 90 % en el benchmark actual.
- Análisis anual: de ~118,7 ms tras la primera mejora común a ~30,1 ms; JSON exactamente igual antes de aplicar la sustitución. El histórico previo rondaba ~365 ms de media.
- Presupuesto mensual + proyección anual: de ~124,5 ms a ~49,1 ms tras optimizar el cálculo mensual; la parte mensual fue validada con igualdad JSON exacta. El histórico previo rondaba ~297 ms de media.
- Inicio (`financial_app_dashboard()`): ~20,5 ms en la medición posterior a las optimizaciones.

Principios mantenidos:

- No se cachean saldos, presupuestos ni movimientos para ocultar latencia.
- No se altera el origen bancario ni la lógica de divisiones personales.
- No se eliminan comprobaciones de autorización.
- Las sustituciones se prueban primero dentro de transacciones revertidas y se aplican solo tras verificar equivalencia.

## Higiene HTTP

El uso real de Preview mostró un único 404 explícito para `/favicon.ico`. Se redirige ahora al icono canónico `/icon.png` para evitar peticiones fallidas sin duplicar activos.

## Pendientes reales antes de promover 1.0.0 estable

1. Google OAuth real en Supabase y E2E de cuenta autorizada/no autorizada. Preview puede seguir usando el puente temporal de un solo uso hasta entonces.
2. `package-lock.json` reproducible y cambio del CI a `npm ci`. No se fabricará manualmente: debe generarse con acceso válido al registro de npm.
3. Drill-down coherente desde gráficos y paneles hacia Movimientos con filtros URL reutilizables.
4. Validación formal WCAG 2.2 AA, además de la accesibilidad ya incorporada en componentes y navegación.
5. Limpieza controlada de documentación, migraciones y Edge Functions heredadas, solo después de comprobar dependencias para evitar regresiones.

## Regla de avance

No se promociona este RC a producción mientras queden bloqueadores de seguridad, autenticación o reproducibilidad. Las mejoras se agrupan en cambios coherentes para reducir despliegues Preview y consumo de recursos gratuitos.
