# Financial App 2.1.0

Aplicación financiera personal privada para control, presupuesto, planificación y análisis basados en datos reales.

2.1.0 evoluciona la base estable 2.0.1 sin cambiar las reglas financieras: mejora legibilidad, navegación, shell persistente, rendimiento de Movimientos y coherencia del Plan.

## Principios permanentes
- Fuente bancaria externa exclusivamente en modo lectura.
- El origen nunca se reescribe desde la aplicación.
- Datos originales y enriquecimientos privados permanecen separados.
- Traspasos internos, duplicados y ahorro se excluyen según las reglas financieras validadas.
- Ediciones, splits, reglas, conciliación y cierres son trazables y reversibles.
- Acceso privado obligatorio y allowlist de servidor.
- Responsive mobile-first, accesibilidad, pruebas de regresión, typecheck y build reproducible.

Los axiomas completos están en `docs/PROJECT_AXIOMS.md`.

## 2.0 — Plan Financiero unificado
- Ruta `/plan` como capa de decisión única sobre presupuesto, previsión, objetivos, patrimonio y Control.
- El Plan reutiliza los motores financieros canónicos existentes y no duplica fórmulas en el navegador.
- Una única llamada a `financial_app_plan_overview` agrega resumen, estado, capacidad y prioridades explicables.
- Cada prioridad conserva trazabilidad mediante `sourcePath` y enlaza al módulo operativo de origen.
- La capa Plan es de solo lectura: no modifica movimientos, presupuestos, previsiones, objetivos, patrimonio, reglas ni cierres.
- Se preservan las garantías de rendimiento de 1.7, recuperación transaccional de 1.8 y motor documental first-party de 1.9.

## 2.0.1 — estabilización
- Google OAuth activo y validado con sesión real.
- Supabase usa el dominio de producción y ya no retorna a `localhost:3000`.
- Los errores inmediatos de Google OAuth se muestran en la pantalla de acceso.
- Hotfix de Previsión: ningún overview/GET genera ocurrencias ni ejecuta escrituras.
- Inicio, Plan, Movimientos, detalle y Reglas protegidos como rutas de lectura `STABLE` cuando corresponde.
- Smoke de rutas críticas ejecutado sobre la base real sin alterar datos financieros.
- Release readiness validado con identidad Google, sin fallos.
- Gate `audit:v201` permanente para impedir regresiones de estas garantías.

## 2.1.0 — rendimiento, legibilidad y coherencia
- Navegación privada con prefetch por intención, evitando precargar todas las rutas automáticamente.
- Tipografía compacta reforzada para mejorar legibilidad en escritorio, tablet y móvil.
- Shell persistente con un único sidebar; eliminados 16 sidebars internos redundantes.
- Movimientos reutiliza las facetas de la primera carga y evita reenviar datos repetidos en paginaciones y filtros posteriores.
- Baseline real de rendimiento documentado en `docs/PERFORMANCE_V2.1.0.md`.
- Plan auditado contra los motores canónicos de Presupuesto, Previsión, Objetivos, Patrimonio y Control.
- Inicio mantiene horizonte inmediato de 30 días y Plan horizonte explícito de 90 días.
- Gate `audit:v210` protege navegación, legibilidad, shell único, Movimientos ligero y coherencia del Plan.

## Funciones principales
- Inicio financiero con cuentas, Cash Flow, presupuesto, previsión, categorías y Control.
- Plan Financiero unificado con prioridades explicables y capacidad para objetivos.
- Movimientos editables y trazables, filtros avanzados, splits, documentos y conciliación.
- Reglas automáticas con preview, prioridad, aplicación histórica y deshacer seguro.
- Presupuesto mensual/anual, previsiones, escenarios, objetivos y patrimonio.
- Centro de Control y cierre/reapertura mensual.
- Archivo documental privado con OCR local y asociaciones a movimientos.
- Configuración, tema y copia portable/restaurable de la capa privada.

## Producción
- Acceso mediante Google OAuth y allowlist de servidor.
- Vercel: región `cdg1`.
- Dominio público: `financialapp-home.vercel.app`.
- La rama `financial-app-rebuild` mantiene el despliegue automático deshabilitado para evitar previews y consumo innecesario.
- Una release solo se promociona a `main` después de superar CI y el release readiness.

No se deben subir al repositorio credenciales, claves privadas, extractos bancarios, CSV/XLSX/PDF personales, backups financieros reales ni binarios generados del motor documental.

## Documentación actual
- `docs/PROJECT_AXIOMS.md`
- `docs/AUDIT_FINANCIAL_APP_1.7.0.md`
- `docs/AUDIT_FINANCIAL_APP_1.8.0.md`
- `docs/AUDIT_FINANCIAL_APP_1.9.0.md`
- `docs/AUDIT_FINANCIAL_APP_2.0.0.md`
- `docs/AUDIT_FINANCIAL_APP_2.0.1.md`
- `docs/PERFORMANCE_V2.1.0.md`
- `docs/COHERENCE_V2.1.0.md`
- `docs/RELEASE_GATE_V2.1.0.md`
- `supabase/README.md`
