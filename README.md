# Financial App 1.9.0

Aplicación financiera personal privada para control, presupuesto, planificación y análisis basados en datos reales.

## Principios permanentes
- Fuente bancaria externa exclusivamente en modo lectura.
- El origen nunca se reescribe desde la aplicación.
- Datos originales y enriquecimientos privados permanecen separados.
- Traspasos internos, duplicados y ahorro se excluyen según las reglas financieras validadas.
- Ediciones, splits, reglas, conciliación y cierres son trazables y reversibles.
- Acceso privado obligatorio y allowlist de servidor.
- Responsive mobile-first, accesibilidad, pruebas de regresión, typecheck y build reproducible.

Los axiomas completos están en `docs/PROJECT_AXIOMS.md`.

## 1.9.0 — motor documental first-party
- Archivo mantiene el OCR en navegador y elimina dependencias CDN en tiempo de uso.
- Tesseract.js 7.0.0, PDF.js 6.2.108 y los datos españoles se fijan en `package-lock.json`.
- Los assets documentales se reconstruyen desde dependencias bloqueadas durante instalación/build y se sirven desde el mismo origen.
- Cada asset generado queda cubierto por tamaño y SHA-256; `audit:v19` impide regresiones a CDNs o binarios inesperados.
- Se conserva la arquitectura 1.7 de rendimiento y la recuperación privada transaccional 1.8.

## Funciones principales
- Inicio financiero con cuentas, Cash Flow, presupuesto, previsión, categorías y Control.
- Movimientos editables y trazables, filtros avanzados, splits, documentos y conciliación.
- Reglas automáticas con preview, prioridad, aplicación histórica y deshacer seguro.
- Presupuesto mensual/anual, previsiones, escenarios, objetivos y patrimonio.
- Centro de Control y cierre/reapertura mensual.
- Archivo documental privado con OCR local y asociaciones a movimientos.
- Configuración, tema y copia portable/restaurable de la capa privada.

## Seguridad y producción
Google OAuth es el acceso definitivo previsto, pero la aplicación no debe declararse lista para producción mientras el proveedor Google no esté validado en Supabase. `financial_app_release_readiness()` mantiene ese bloqueo de forma explícita.

No se deben subir al repositorio credenciales, claves privadas, extractos bancarios, CSV/XLSX/PDF personales, backups financieros reales ni los binarios generados del motor documental.

## Documentación actual
- `docs/PROJECT_AXIOMS.md`
- `docs/AUDIT_FINANCIAL_APP_1.7.0.md`
- `docs/AUDIT_FINANCIAL_APP_1.8.0.md`
- `docs/AUDIT_FINANCIAL_APP_1.9.0.md`
- `database/FINANCIAL_APP_1.9.0_VERSION.sql`
- `supabase/README.md`
