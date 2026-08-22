# Financial App 2.0.0

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

## 2.0.0 — Plan Financiero unificado
- Nueva ruta `/plan` como capa de decisión única sobre presupuesto, previsión, objetivos, patrimonio y Control.
- El Plan reutiliza los motores financieros canónicos existentes y no duplica fórmulas en el navegador.
- Una única llamada a `financial_app_plan_overview` agrega resumen, estado, capacidad y prioridades explicables.
- Cada prioridad conserva trazabilidad mediante `sourcePath` y enlaza al módulo operativo de origen.
- La capa Plan es de solo lectura: no modifica movimientos, presupuestos, previsiones, objetivos, patrimonio, reglas ni cierres.
- Se preservan íntegramente las garantías de rendimiento de 1.7, recuperación transaccional de 1.8 y motor documental first-party de 1.9.

## Funciones principales
- Inicio financiero con cuentas, Cash Flow, presupuesto, previsión, categorías y Control.
- Plan Financiero unificado con prioridades explicables y capacidad para objetivos.
- Movimientos editables y trazables, filtros avanzados, splits, documentos y conciliación.
- Reglas automáticas con preview, prioridad, aplicación histórica y deshacer seguro.
- Presupuesto mensual/anual, previsiones, escenarios, objetivos y patrimonio.
- Centro de Control y cierre/reapertura mensual.
- Archivo documental privado con OCR local y asociaciones a movimientos.
- Configuración, tema y copia portable/restaurable de la capa privada.

## Seguridad y producción
Google OAuth es el acceso definitivo previsto. `financial_app_release_readiness()` mantiene el gate operativo y debe validar la identidad Google autorizada junto con el resto de invariantes antes de considerar una release completamente apta.

No se deben subir al repositorio credenciales, claves privadas, extractos bancarios, CSV/XLSX/PDF personales, backups financieros reales ni los binarios generados del motor documental.

## Despliegue actual
- Vercel: región `cdg1`.
- Dominio público asignado: `financial-app-massmedi.vercel.app`.
- La rama de desarrollo `financial-app-rebuild` permanece con despliegue automático deshabilitado para evitar previews innecesarios.

## Documentación actual
- `docs/PROJECT_AXIOMS.md`
- `docs/AUDIT_FINANCIAL_APP_1.7.0.md`
- `docs/AUDIT_FINANCIAL_APP_1.8.0.md`
- `docs/AUDIT_FINANCIAL_APP_1.9.0.md`
- `docs/AUDIT_FINANCIAL_APP_2.0.0.md`
- `database/FINANCIAL_APP_1.9.0_VERSION.sql`
- `supabase/README.md`
