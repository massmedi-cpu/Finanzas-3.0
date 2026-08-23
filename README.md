# Financial App 2.8.0

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

## 2.0 — Plan Financiero unificado
- Ruta `/plan` como capa de decisión única sobre presupuesto, previsión, objetivos, patrimonio y Control.
- Una única llamada a `financial_app_plan_overview` agrega resumen, estado, capacidad y prioridades explicables.
- La capa Plan es de solo lectura y reutiliza motores financieros canónicos.
- Se preservan rendimiento 1.7, recuperación 1.8 y motor documental first-party 1.9.

## 2.0.1 — estabilización
- Google OAuth activo y validado con sesión real.
- Supabase usa el dominio de producción y no retorna a localhost.
- Lecturas críticas protegidas contra efectos secundarios.
- Smoke real y gate `audit:v201` para impedir regresiones.

## 2.1.0 — rendimiento, legibilidad y coherencia
- Navegación privada con prefetch por intención.
- Tipografía compacta reforzada y shell persistente con un único sidebar.
- Movimientos evita reenviar facetas repetidas en paginaciones y filtros posteriores.
- Plan auditado contra Presupuesto, Previsión, Objetivos, Patrimonio y Control.
- Gate `audit:v210`.

## 2.2.0 — analítica comparativa
- Análisis compara únicamente periodos completos cuando corresponde.
- Medias, tasa de ahorro, variabilidad, tendencia, concentración y cobertura derivan del overview canónico.
- Ninguna métrica analítica escribe movimientos ni altera el origen.
- Gates `audit:v220` y `test:analytics`.

## 2.3.0 — inteligencia financiera explicable
- Señales deterministas sobre liquidez, presupuesto, objetivos, patrimonio, Control y contexto analítico.
- Sin modelos externos para inventar cifras ni mutaciones financieras.
- Cada señal conserva trazabilidad al módulo de origen.
- Gates `audit:v230` y `test:intelligence`.

## 2.4.0 — horizonte de planificación
- Capacidad visible a 3, 6 y 12 meses.
- La proyección de capacidad es lineal y explícita; no se presenta como saldo bancario futuro.
- Previsión bancaria y patrimonio previsto continúan limitados a 90 días.
- Ruta privada `/plan/horizonte` y gates `audit:v240` + `test:horizon`.

## 2.5.0 — cierre mensual y formato España
- Se preservan las reglas y bloqueos del cierre mensual existente y su trazabilidad.
- Formato numérico español centralizado: miles con punto y decimales con coma (`1.234.567,89`).
- Euros, porcentajes, enteros y cifras con signo usan la misma capa de formato.
- El cambio es de presentación: no modifica importes, fórmulas financieras ni datos de origen.
- Gates `audit:v250` y `test:format`.

## 2.6.0 — reglas seguras y deterministas
- Reglas con preview obligatorio y sin escritura sobre la fuente bancaria.
- Prioridad determinista, cuenta/dirección opcionales y protección frente a formularios modificados tras el preview.
- Overrides manuales y splits conservan precedencia sobre automatismos.
- Pausar, reactivar y eliminar reglas es reversible y auditado.
- Tratamiento horario centralizado para Europe/Madrid y pruebas `test:time`.
- Gate `audit:v260`.

## 2.7.0 — explicabilidad y procedencia
- Cada clasificación puede identificar su procedencia: fuente, regla, ajuste manual o split.
- Las sugerencias son conservadoras, no escriben datos automáticamente y exigen preview antes de convertirse en regla.
- Nueva superficie privada `/explicabilidad` con trazabilidad al dato de origen.
- Edge/RPC privilegiadas permanecen fail-closed y service-role only.
- Gates `audit:v270` y `test:explainability`.

## 2.8.0 — Centro de Control e integridad
- Centro de Control ampliado con snapshot técnico rápido y read-only.
- Auditoría profunda únicamente bajo acción explícita del usuario.
- Comprobaciones de checksum de fuente, fingerprint estructural, IDs, cuentas, sincronización, continuidad, calidad y archivo privado.
- Historial de auditorías persistente protegido por RLS.
- La auditoría no modifica movimientos, presupuestos ni la fuente bancaria.
- Gates `audit:v280` y `test:integrity`, acumulados sobre todas las auditorías 1.7 → 2.7.

## Funciones principales
- Inicio financiero con cuentas, Cash Flow, presupuesto, previsión, categorías y Control.
- Plan Financiero unificado con prioridades explicables y capacidad para objetivos.
- Movimientos editables y trazables, filtros avanzados, splits, documentos y conciliación.
- Reglas automáticas seguras con preview, prioridad y reversibilidad.
- Explicabilidad de clasificaciones y sugerencias conservadoras.
- Presupuesto mensual/anual, previsiones, escenarios, objetivos y patrimonio.
- Centro de Control con integridad del sistema y cierre/reapertura mensual.
- Archivo documental privado con OCR local y asociaciones a movimientos.
- Configuración, tema y copia portable/restaurable de la capa privada.

## Producción
- Acceso mediante Google OAuth y allowlist de servidor.
- Vercel: región `cdg1`.
- Dominio público: `financialapp-home.vercel.app`.
- Las ramas de desarrollo mantienen el despliegue automático deshabilitado para evitar previews y consumo innecesario.
- Una release sólo se promociona a `main` después de superar CI completo y el gate de release.

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
- `docs/RELEASE_GATE_V2.2.0.md`
- `docs/RELEASE_GATE_V2.3.0.md`
- `docs/RELEASE_GATE_V2.4.0.md`
- `docs/RELEASE_GATE_V2.5.0.md`
- `docs/RELEASE_GATE_V2.6.0.md`
- `docs/RELEASE_GATE_V2.7.0.md`
- `docs/RELEASE_GATE_V2.8.0.md`
- `supabase/README.md`
