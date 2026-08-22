# Financial App 2.0.1 — estabilización

Aplicación financiera personal privada para control, presupuesto, planificación y análisis basados en datos reales.

> Estado: 2.0.1 está en rama de estabilización. Producción permanece en 2.0.0 hasta superar el gate completo y realizar un único despliegue de release.

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
- Google OAuth validado con sesión real de producción.
- Supabase usa el dominio de producción y ya no retorna a `localhost:3000`.
- Hotfix de Previsión: ningún overview/GET genera ocurrencias ni ejecuta escrituras.
- Inicio, Plan, Movimientos, detalle y Reglas protegidos como rutas de lectura `STABLE` cuando corresponde.
- Smoke test de las rutas críticas ejecutado sobre la base real sin alterar datos financieros.
- Error inmediato de Google OAuth visible en la pantalla de login.
- Nuevo gate `audit:v201` para impedir regresiones de estas garantías.

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
Google OAuth está activo y validado. El acceso continúa limitado por la allowlist de servidor y `financial_app_release_readiness()` mantiene el gate operativo para futuras releases.

No se deben subir al repositorio credenciales, claves privadas, extractos bancarios, CSV/XLSX/PDF personales, backups financieros reales ni los binarios generados del motor documental.

## Despliegue actual
- Vercel: región `cdg1`.
- Dominio público: `financialapp-home.vercel.app`.
- La rama `financial-app-rebuild` mantiene el despliegue automático deshabilitado para evitar previews y consumo innecesario.

## Documentación actual
- `docs/PROJECT_AXIOMS.md`
- `docs/AUDIT_FINANCIAL_APP_1.7.0.md`
- `docs/AUDIT_FINANCIAL_APP_1.8.0.md`
- `docs/AUDIT_FINANCIAL_APP_1.9.0.md`
- `docs/AUDIT_FINANCIAL_APP_2.0.0.md`
- `docs/AUDIT_FINANCIAL_APP_2.0.1.md`
- `supabase/README.md`
