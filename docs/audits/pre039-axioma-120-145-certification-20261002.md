# PRE-039 — Certificación Axioma §§120–145

Fecha de apertura: 2026-10-02  
Base: Financial App 10.0.51  
Rama: `audit/pre039-axioma-120-145`

## Objetivo

Cerrar de forma verificable los apartados §§120–145 del Prompt Maestro Axioma antes de la siguiente publicación. Este documento es una matriz de evidencia: **no convierte en superado ningún apartado por el mero hecho de documentarlo**.

Estados usados:

- `EVIDENCIA_EXISTENTE`: existe cobertura relevante en repositorio, pendiente de certificación conjunta.
- `PENDIENTE_RUNTIME`: requiere ejecución real de pruebas/build/CI.
- `PENDIENTE_MANUAL`: exige revisión humana o validación en entorno real.
- `PENDIENTE_RELEASE`: solo puede cerrarse durante la publicación y smoke posterior.

## Matriz §§120–145

| § | Axioma | Evidencia / acción PRE-039 | Estado antes de certificar |
|---:|---|---|---|
| 120 | Últimos Casos Extremos Financieros | `extreme-financial-edge-cases-10.0.32.spec.ts`, `extreme-financial-scenarios.spec.ts` y contratos financieros ya existentes. Ejecutar conjuntamente y revisar importes extremos/no finitos/duplicados. | PENDIENTE_RUNTIME |
| 121 | Casos de Prueba Concretos | Cobertura existente de periodos sin ingresos, periodos vacíos, históricos parciales y análisis finito. Confirmar los ejemplos concretos de presentación exigidos por Axioma. | PENDIENTE_RUNTIME |
| 122 | Comportamiento ante Cambios y Borrados | `safe-reversible-edits.spec.ts` y contratos de overrides separados de la fuente bancaria. Ejecutar regresión de edición/borrado/recalculo. | PENDIENTE_RUNTIME |
| 123 | Responsividad Iterativa y Consistencia de Datos | `responsive-matrix-10.0.49.spec.ts` y `test:responsive-matrix`. Ejecutar matriz 320/480/768/1024/1440 y comprobar consistencia financiera. | PENDIENTE_RUNTIME |
| 124 | Depuración Final de Datos y Limpieza de Inconsistencias | Revisión final de fixtures, basura de desarrollo, duplicados y datos temporales antes de release. | PENDIENTE_MANUAL |
| 125 | Código Temporal de Desarrollo: Eliminación y Limpieza | Typecheck/build más revisión de debug globals, listeners duplicados, TODO/FIXME y código muerto. | PENDIENTE_RUNTIME |
| 126 | Versionado y Publicación de Mejoras y Políticas | Mantener 10.0.51 hasta aprobar la certificación; bump, changelog, commit/tag solo al publicar. | PENDIENTE_RELEASE |
| 127 | Duplicidades en Subida y Manejo de Archivos | Revalidar contratos de sincronización/importación y rechazo visible de duplicados; no duplicar filas persistidas. | PENDIENTE_RUNTIME |
| 128 | Balance y Límites en Google Document AI | Revalidar límites/lotes/cooldown y comportamiento de saturación; no certificar por inspección estática únicamente. | PENDIENTE_RUNTIME |
| 129 | Seguridad y Privacidad en Datos Financieros y OCR | Revisar que logs no expongan valores sensibles y que exportación/compartición tenga advertencias/consentimiento donde aplique. | PENDIENTE_MANUAL |
| 130 | Seguimiento Completo y Diagrama Excel (Gantt) | Registrar PRE-039 en el Gantt y actualizarlo en cada avance relevante. | PENDIENTE_MANUAL |
| 131 | Gestión de Cambios de Objetivos durante el Proceso | PRE-039 reutiliza pruebas existentes en vez de crear motores paralelos; cualquier aplazamiento debe quedar documentado. | EVIDENCIA_EXISTENTE |
| 132 | Manejo de Casos Límite de Importes | Casos financieros extremos existentes; verificar overflow/Infinity/NaN/decimales inválidos y que no se persistan valores inválidos. | PENDIENTE_RUNTIME |
| 133 | Prevención de Corrupción por Acciones Concurrentes | Ejecutar casos de edición simultánea y save-vs-delete/recalculo; confirmar atomicidad/detección. | PENDIENTE_RUNTIME |
| 134 | Recuperación y Resiliencia ante Errores del Entorno | Revalidar fallos de red/storage/backend y recuperación sin falso éxito ni bloqueo permanente. | PENDIENTE_RUNTIME |
| 135 | Verificación de Accesibilidad Final | Revalidar teclado/ARIA/contraste y cualquier gate de accesibilidad existente antes de publicar. | PENDIENTE_RUNTIME |
| 136 | Incorporación de Aprendizajes | Esta matriz consolida hallazgos y obliga a convertir fallos recurrentes en contratos/pruebas. Añadir cualquier nuevo aprendizaje descubierto en PRE-039. | EVIDENCIA_EXISTENTE |
| 137 | Priorización de Mejoras Emergentes | Clasificar hallazgos PRE-039 como bloqueo de release o mejora diferible, dejando trazabilidad. | PENDIENTE_MANUAL |
| 138 | Protección ante Datos Corruptos/Hackeados/Inesperados | Revalidar reglas, ACL, entradas ilegales, inyección/XSS y consistencia; cualquier crítico bloquea publicación. | PENDIENTE_RUNTIME |
| 139 | Adaptabilidad Responsive | Usar la matriz responsive existente, incluida orientación/safe areas cuando proceda, sobre vistas modificadas. | PENDIENTE_RUNTIME |
| 140 | Validación Activa de Experiencia de Usuario Real | Debe realizarse sobre el candidato real en entorno real. No se considera sustituible por una prueba automatizada. | PENDIENTE_MANUAL |
| 141 | Permisos y Accesos Sensibles | Revisar mínimo privilegio y errores 401/403/denegación en auth, storage, import/export y servicios externos. | PENDIENTE_RUNTIME |
| 142 | Revisión Final de Logs y Trazabilidad | Revisar logs/trazas del candidato después de ejecutar gates y adjuntar evidencia antes de release. | PENDIENTE_MANUAL |
| 143 | Recuperación ante Fallos Críticos | Forzar fallos representativos y comprobar backup/reversión/recuperación sin pérdida ni falso éxito. | PENDIENTE_RUNTIME |
| 144 | Revisión antes de cada Publicación Mayor | Ejecutar matriz final: finanzas, integración, build/typecheck, responsive, accesibilidad, seguridad, errores y backup. Cero críticos abiertos. | PENDIENTE_RELEASE |
| 145 | Integridad de Árboles Funcionales | Confirmar una sola fuente de verdad por cálculo/flujo, sin cálculos duplicados, ramas huérfanas ni responsabilidades paralelas. | PENDIENTE_MANUAL |

## Puerta PRE-039

La certificación se divide en cuatro capas y deben quedar todas satisfechas antes de publicar:

1. **Estática:** `npm run verify:pre039` valida que la evidencia mínima, la matriz y la orquestación existan.
2. **Runtime:** typecheck, build y suites críticas financieras/responsive/recuperación/seguridad aplicables.
3. **Humana:** §§124, 129, 130, 137, 140, 142 y 145 requieren revisión o evidencia manual real donde corresponda.
4. **Release:** §§126 y 144 se cierran únicamente al versionar, publicar y completar smoke posterior.

## Regla de salida

PRE-039 no puede declararse `COMPLETADO` ni provocar un bump de versión si:

- falla cualquier gate crítico;
- queda un incidente financiero, de integridad, seguridad o recuperación sin resolver;
- no existe evidencia de validación UX real (§140);
- no se ha revisado la trazabilidad/logs (§142);
- no se ha ejecutado la matriz previa de publicación (§144).

## Evidencia ya localizada

- `tests/e2e/extreme-financial-edge-cases-10.0.32.spec.ts`
- `tests/e2e/extreme-financial-scenarios.spec.ts`
- `tests/e2e/analysis-history-integrity.spec.ts`
- `tests/e2e/safe-reversible-edits.spec.ts`
- `tests/e2e/recurrences.spec.ts`
- `tests/e2e/responsive-matrix-10.0.49.spec.ts`
- `.github/workflows/extreme-financial-edge-cases.yml`
- `.github/workflows/quality-edge-ci-gates-10.0.41.yml`

La siguiente acción es ejecutar la puerta unificada, corregir cualquier fallo real y solo después preparar la publicación candidata.
