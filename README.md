# Financial App 1.7.0

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

## 1.7.0 — rendimiento y arquitectura
- Inicio consolidado en una sola RPC financiera (`financial_app_home_overview`) en lugar de seis viajes independientes.
- Shell persistente: la navegación permanece mientras cambia el workspace.
- Navegación móvil simplificada a Inicio, Movimientos, Control, Presupuesto y Más.
- CSS de cada módulo cargado desde su layout de ruta en vez de incluir todas las hojas en el layout raíz.
- `GET /api/movements` es lectura pura; el reconocimiento de movimientos vistos se realiza mediante POST tras montar la vista.
- Dashboard y release-readiness usan la versión canónica de aplicación.
- Inicio consume el resumen accionable del Centro de Control.
- Manifest PWA real y política de caché larga únicamente para activos inmutables; los datos financieros vivos siguen `private, no-store`.
- Backup portable de la capa privada con validación de formato y coincidencia de fuente antes de una futura restauración.
- Runtime Supabase actual documentado y Edge Function de importación inicial deshabilitada incorporada al repositorio.

## Funciones principales
- Inicio financiero con cuentas, Cash Flow, presupuesto, previsión, categorías y Control.
- Movimientos editables y trazables, filtros avanzados, splits, documentos y conciliación.
- Reglas automáticas con preview, prioridad, aplicación histórica y deshacer seguro.
- Presupuesto mensual/anual, previsiones, escenarios, objetivos y patrimonio.
- Centro de Control y cierre/reapertura mensual.
- Archivo documental privado con OCR local y asociaciones a movimientos.
- Configuración, tema y copia portable de la capa privada.

## Seguridad y producción
Google OAuth es el acceso definitivo previsto, pero la aplicación no debe declararse lista para producción mientras el proveedor Google siga deshabilitado en Supabase. `financial_app_release_readiness()` mantiene ese bloqueo de forma explícita.

No se deben subir al repositorio credenciales, claves privadas, extractos bancarios, CSV/XLSX/PDF personales ni backups financieros reales.

## Documentación actual
- `docs/PROJECT_AXIOMS.md`
- `docs/AUDIT_FINANCIAL_APP_1.7.0.md`
- `database/FINANCIAL_APP_1.7.0_ARCHITECTURE_FOUNDATION.sql`
- `database/FINANCIAL_APP_1.7.0_VERSION.sql`
- `supabase/README.md`
