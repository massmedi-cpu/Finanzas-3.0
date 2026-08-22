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

## Regresión detectada en uso real de Preview y corregida

Se detectó `permission denied for function goals_overview_core` al abrir Objetivos. La causa era un desajuste de ACL: los wrappers públicos tenían permiso para `authenticated`, pero las tres funciones core de Objetivos solo concedían ejecución a `postgres`.

Corrección aplicada y validada:

- `financial_app.goals_overview_core()` → EXECUTE para `authenticated` y `service_role`.
- `financial_app.upsert_goal_core(...)` → EXECUTE para `authenticated` y `service_role`.
- `financial_app.deactivate_goal_core(uuid)` → EXECUTE para `authenticated` y `service_role`.
- `anon` continúa sin acceso.
- Validación con sesión `authenticated` y usuario allowlisted: resumen de Objetivos ejecutado correctamente; no se crearon ni modificaron objetivos reales.
- Auditoría preventiva de todos los wrappers `public.financial_app_*` que llaman a `financial_app.*_core`: no se detectaron otros desajustes equivalentes.

## Higiene HTTP

El uso real de Preview mostró un único 404 explícito para `/favicon.ico`. Se redirige ahora al icono canónico `/icon.png` para evitar peticiones fallidas sin duplicar activos.

## Pendientes reales antes de promover 1.0.0 estable

1. Google OAuth real en Supabase y E2E de cuenta autorizada/no autorizada. Preview puede seguir usando el puente temporal de un solo uso hasta entonces.
2. `package-lock.json` reproducible y cambio del CI a `npm ci`. No se fabricará manualmente: debe generarse con acceso válido al registro de npm.
3. Drill-down coherente desde gráficos y paneles hacia Movimientos con filtros URL reutilizables.
4. Validación formal WCAG 2.2 AA, además de la accesibilidad ya incorporada en componentes y navegación.
5. Medición formal de rendimiento/observabilidad sobre rutas reales y corrección de los cuellos de botella que aparezcan.
6. Limpieza controlada de documentación, migraciones y Edge Functions heredadas, solo después de comprobar dependencias para evitar regresiones.

## Regla de avance

No se promociona este RC a producción mientras queden bloqueadores de seguridad, autenticación o reproducibilidad. Las mejoras se agrupan en cambios coherentes para reducir despliegues Preview y consumo de recursos gratuitos.
