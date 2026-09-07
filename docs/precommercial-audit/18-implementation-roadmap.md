# 18 · Roadmap de implementación precomercial

## Regla de ejecución

Estado base: Financial App 10.0.0 validado. Estado comercial: **NO APTA**.

Cada bloque sigue obligatoriamente:

**analizar → introducir prueba que demuestre el problema cuando proceda → implementar → ejecutar tests específicos → ejecutar regresión relacionada → comparar antes/después → decidir si se conserva.**

No se modifica `main` ni Production desde esta rama mientras no exista evidencia suficiente. Los P0 de productización multiusuario no se mezclan con mejoras de la instancia personal.

---

## BLOQUE A · Higiene de producto y hardening de bajo riesgo — PRIMERO

**Prioridad:** P1.  
**Objetivo:** eliminar señales amateur/ambiguas y cerrar controles baratos sin tocar motores financieros.

### A1 · PRE-017 — semántica financiera correcta

- `Disponible total` → `Saldo total en cuentas`.
- `Patrimonio disponible` → `Cuentas` / `Saldo en cuentas` según contexto.
- `Fuente bancaria preferente` → `Saldo confirmado por el banco` cuando corresponda.
- No llamar patrimonio, liquidez o disponible a métricas que el motor no calcula.

**Archivos iniciales:** `app/dashboard-client.tsx`, `app/accounts/accounts-client.tsx`, tests de dashboard/cuentas y cualquier superficie encontrada por búsqueda.  
**Tests:** asserts de copy + regresión visual/semántica.

### A2 · PRE-018 — retirar lenguaje de desarrollo del uso normal

- Eliminar `FASE N` de Inicio, Movimientos, Cuentas, Presupuestos, Recurrentes, Previsión, Documentos y Configuración/Fuente.
- Cambiar enlaces como `← Fundamentos` por navegación comprensible para usuario.
- Build/runtime/contratos permanecen disponibles sólo en diagnóstico técnico/API, no se destruyen.

**Tests:** ninguna superficie principal contiene `FASE ` en DOM normal; `/api/build` continúa disponible.

### A3 · FE-004/005 — estados globales

Crear:

- `app/not-found.tsx`.
- `app/loading.tsx`.
- `app/error.tsx`.

**Criterio:** copy en español, salida útil, foco/navegación accesibles y sin filtrar errores internos.

### A4 · PRE-005 seguro — headers sin CSP todavía

- `poweredByHeader: false`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy` explícita.
- `Permissions-Policy` restrictiva para capacidades no usadas.
- Frame protection compatible con la app actual.

**No incluir CSP en este bloque** hasta inventariar workers/scripts/OCR para evitar regresiones.

### A5 · PRE-013 — ampliar gate responsive

- Añadir viewport 430 px.
- Añadir `/configuration/source` a la matriz.
- Comprobar targets interactivos visibles >= 44 px cuando el control es táctil operativo.

**Riesgo:** algunos controles de Previsión fallarán inicialmente; la prueba debe preceder a la corrección.

---

## BLOQUE B · Correctitud de estado cliente

**Prioridad:** P1.  
**Dependencia:** A estable.

### B1 · PRE-016 — carrera de peticiones en Movimientos

- Añadir secuencia de request o AbortController a cargas de reemplazo.
- Mantener paginación append separada para no mezclar cursores.
- Crear test A-lenta/B-rápida que falle antes del fix.

**Archivos:** `app/transactions/transactions-client.tsx`, `tests/e2e/transactions.spec.ts`.

### B2 · PRE-015 — Inicio y peticiones financieras

Revalidar primero el hallazgo PERF-001 antes de eliminar nada. El `snapshot` actual usa el mismo rango para resumen y serie mensual; si Inicio necesita mes actual + año actual, una llamada mensual separada puede ser necesaria. No se elimina por dogma.

Opciones permitidas sólo tras prueba:

1. mantener ambas llamadas y marcar PERF-001 como falso positivo; o
2. crear un agregador/dashboard contract que componga ambos rangos server-side sin duplicar lógica financiera.

Después, abordar tolerancia a fallos parciales con `Promise.allSettled`/widgets independientes o agregador con degradación controlada.

**Criterio:** un fallo en Presupuesto/Previsión/Actividad no debe ocultar saldo y balance si éstos están sanos.

---

## BLOQUE C · Accesibilidad y experiencia móvil operativa

**Prioridad:** P1.  
**Dependencia:** A5 define la gate.

- Corregir targets <44 px empezando por Previsión.
- Elevar microtexto funcional a mínimos aprobados.
- `aria-invalid` + `aria-describedby` en formularios con error de campo.
- Gestión de foco al abrir editor/revisión y tras errores.
- Verificar 360/430/480/768/1024/1280/1440 y zoom/reflow.

**Archivos principales:** forecast, transactions, configuration/source, budgets, globals/tokens/tests.

---

## BLOQUE D · Sistema visual único + AppShell

**Prioridad:** P1.  
**Dependencias:** A y C para no institucionalizar patrones defectuosos.

### D1 · PRE-012

- Consolidar tokens semánticos como fuente única.
- Migrar Previsión desde tema claro/beige a identidad común.
- Centralizar iconografía y primitivas de superficie/control por migración incremental.

### D2 · PRE-008

- AppShell compartido.
- Navegación persistente en escritorio.
- Navegación móvil adecuada al ancho/touch.
- Estado activo y acceso a Recurrentes.

**No reescribir todas las páginas simultáneamente.** Orden: Inicio → Movimientos → Previsión → resto.

---

## BLOQUE E · Producto que falta: comprender y resolver

**Prioridad:** P1.

### E1 · PRE-011 — Para revisar

Agregador read-only de referencias a estados existentes: movimientos `needs_review`, duplicados, recurrentes, documentos pendientes, presupuesto/forecast/sync relevantes. Cada elemento enlaza al dueño real del estado; no crea una segunda fuente de verdad.

### E2 · PRE-009 — Análisis

Superficie read-only basada en motores centrales:

- comparación temporal;
- ingresos/gastos/neto;
- drivers por categoría/comercio;
- drill-down a Movimientos con filtros;
- sin cálculos financieros duplicados en React.

### E3 · PRE-010 — onboarding

Conectar/validar fuente → cuentas → primer resumen → pendientes. Diagnóstico técnico separado.

---

## BLOQUE F · Visualización financiera

**Prioridad:** P1/P2.  
**Dependencia:** D1 tokens/primitives y E2 Análisis.

- Tooltips operables por hover/tap/foco.
- Tabla alternativa accesible.
- Neto con representación divergente correcta.
- Presupuesto muestra magnitud del exceso, no sólo barra al 100 %.
- Previsión incorpora curva de saldo usando `projectedBalanceAfterCents` ya producido por el motor.
- Drill-down a datos causantes.

---

## BLOQUE G · Integridad de escrituras y documentos

**Prioridad:** P1.  
**Riesgo:** medio/alto; se ejecuta después de estabilizar UX inmediata.

- PRE-007 optimistic concurrency + idempotency en creates no idempotentes, comenzando por previsión manual.
- PRE-006 validación de contenido real/magic bytes antes de documento confiable.
- PRE-005 validación same-origin/fetch metadata para mutaciones.
- CSP sólo tras inventario y E2E OCR/OAuth.

---

## BLOQUE H · Productización estructural

**Prioridad:** P0 comercial.  
**No necesaria para mejorar la instancia personal inmediata; sí obligatoria para vender el producto.**

1. PRE-003 aislamiento Preview/Staging/Production.
2. PRE-004 release manifest/SHA/artefacto/deployment.
3. PRE-002 SourceProfile/BankSourceContract conservando adaptador personal bit-a-bit.
4. PRE-001 tenant/workspace y aislamiento de datos.
5. PRE-020 confianza comercial/ciclo de datos.
6. PRE-019 patrimonio/net worth real si se ofrece comercialmente.

Tenancy se implementará mediante migraciones aditivas, backfill, constraints progresivos y tests cross-tenant; nunca con reescritura destructiva.

---

## BLOQUE I · P2 condicionado a evidencia

- PRE-021 DTOs compartidos y extracción de componentes por fronteras estables.
- PRE-022 separar histórico, límite y objetivo en Presupuestos.
- PRE-023 flujo Recurrentes ↔ Previsión.
- PRE-024 Web Vitals/RUM y budgets de rendimiento.
- PRE-025 matriz edge ampliada: 0, max-length, 10k, sesión expirada con draft, base vacía.
- PRE-026 cache/dedupe sólo después de medir.
- PRE-027 OCR queue/batch sync sólo si métricas lo justifican.

---

## Puertas de validación por bloque

Cada bloque debe pasar, según aplique:

- TypeScript/build.
- E2E del módulo afectado.
- `axiom-final-gates` ampliado.
- auth/login/logout.
- persistencia e integridad.
- source read-only/sync.
- OCR documental si toca headers/CSP/uploads.
- 360/430/480/768/1024/1280/1440.
- revisión de datos vivos sin escrituras cuando sea suficiente.

Tras cada bloque se documenta antes/después y riesgo residual.

## Orden ejecutivo

**A → B → C → D → E → F → G → H → I**, con posibilidad de adelantar un subbloque sólo si no introduce dependencia circular ni riesgo de regresión.

El primer trabajo de código será A. PERF-001 queda expresamente en **revalidación**, porque no se eliminará una llamada si los dos rangos financieros son semánticamente distintos.

## Estado

Roadmap técnico: **COMPLETADO**.  
Siguiente fase: **19 · Implementación — BLOQUE A**.
