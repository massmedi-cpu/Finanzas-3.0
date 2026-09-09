# 17 · Comité conjunto — consolidación y matriz P0–P4

## Decisión del comité

Estado de partida: **NO APTA PARA SALIDA COMERCIAL**.

Los 110 hallazgos brutos no se convierten en 110 parches. Se fusionan por causa raíz en **27 iniciativas consolidadas**.

Regla de implementación:

> Estado 10.0.0 validado + mejora aislada + prueba de equivalencia/regresión = nuevo estado validado.

Los P0 que sólo existen por la hipótesis SaaS/multiusuario se mantienen separados del núcleo personal hasta que exista una migración demostrablemente segura.

---

# P0 — CRÍTICO / bloquea una comercialización real

## PRE-001 · Ownership/tenancy real

**Fusiona:** ARC-001, BE-002, BE-003, SEC-001.  
**Causa raíz:** las entidades financieras son globales a la instancia.  
**Acción:** tenant/workspace raíz, ownership propagado, constraints, aislamiento DB/gateway y pruebas negativas cross-tenant.  
**Dependencias:** ninguna de UI; debe diseñarse antes de usuarios múltiples.  
**No hacer:** añadir `user_id` a veinte tablas de golpe sin migración/fixtures.  
**Aceptación:** dos tenants no pueden leer/inferir/escribir datos cruzados y el tenant personal conserva exactamente sus datos.

## PRE-002 · Contrato de fuente configurable sin romper la fuente personal

**Fusiona:** ARC-002, AUD-0002, PROD onboarding comercial.  
**Causa raíz:** el contrato oficial conoce las pestañas/productos personales.  
**Acción:** encapsular contrato actual como adaptador versionado y añadir `SourceProfile/BankSourceContract`.  
**Aceptación:** fuente personal produce batch/fingerprints idénticos; segundo fixture se configura sin editar motor.

## PRE-003 · Aislamiento Preview/Staging/Production

**Fusiona:** BE-001, SEC-002, ARC-003 parcialmente.  
**Causa raíz:** Preview y Production pueden alcanzar la misma persistencia.  
**Acción:** backend/dataset separado o gateway que impida mutaciones normales Preview→Production.  
**Aceptación:** OIDC Preview no puede modificar una fila de Production.

## PRE-004 · Procedencia inmutable del release

**Fusiona:** ARC-004, AUD-0003.  
**Causa raíz:** Production ejecuta candidato validado pero `main` terminó en merge distinto y cuota impidió deployment exacto.  
**Acción:** tag/release manifest/SHA/artefacto/deployment ID y gate post-promoción.  
**Aceptación:** un release comercial identifica un único artefacto y `/api/build` demuestra exactamente ese identificador.

---

# P1 — MUY ALTO / debe resolverse antes de una salida comercial y mejora claramente la app actual

## PRE-005 · Hardening web/autenticación comercial

**Fusiona:** SEC-003, SEC-004, SEC-005, SEC-007.  
**Incluye:** leaked-password protection cuando plataforma lo permita, headers versionados, `poweredByHeader=false`, CSP probada, same-origin/fetch-metadata para mutaciones, política observable de rate limiting.  
**Aceptación:** gates de headers/origen/auth verdes sin romper OAuth/OCR.

## PRE-006 · Validación de contenido documental antes de estado confiable

**Fusiona:** SEC-006 + EDGE upload.  
**Acción:** magic-byte/parser validation en finalize o estado quarantined/pending-validation.  
**Aceptación:** MIME falso no se registra como documento válido.

## PRE-007 · Concurrencia e idempotencia de escritura

**Fusiona:** EDGE-002, EDGE-003 y riesgos backend.  
**Acción:** optimistic concurrency para entidades editables + idempotency key en creates no idempotentes (empezando por forecast manual).  
**Aceptación:** write obsoleta → 409; retry del mismo create no duplica.

## PRE-008 · AppShell y navegación de producto

**Fusiona:** PROD-003, ART-006, ART-009, MOB-002, UX-003.  
**Acción:** shell compartido; escritorio con navegación persistente; móvil con destinos primarios accesibles y secundarios agrupados; estado activo.  
**Aceptación:** ningún módulo exige volver a Inicio para cambiar a otra sección principal.

## PRE-009 · Sección Análisis

**Fusiona:** PROD-001, VIZ-005, Beta 2/7.  
**Acción:** nueva superficie read-only que compone motores existentes: comparación temporal, cash flow, drivers por categoría/comercio y drill-down a Movimientos.  
**Aceptación:** el usuario explica una variación y llega a los movimientos causantes sin cálculo paralelo.

## PRE-010 · Onboarding/first-run

**Fusiona:** PROD-002, MKT-002 parcialmente, UX-001, Beta 1.  
**Acción:** conectar→verificar→cuentas→primer resumen→pendientes; diagnóstico técnico separado.  
**Aceptación:** usuario nuevo llega a valor inicial sin documentación externa.

## PRE-011 · Centro “Para revisar”

**Fusiona:** PROD-006, UX-002, Beta.  
**Acción:** agregador read-only de references a review/duplicates/recurrences/docs/budget/sync/forecast; deep-links al dueño real del estado.  
**Aceptación:** una sola vista permite saber qué requiere acción sin duplicar estados.

## PRE-012 · Sistema visual único + migración de Previsión

**Fusiona:** ART-001, ART-003, ART-005, ART-008, ART-011.  
**Acción:** tokens semánticos únicos, primitivas de superficie/control y migración incremental; Previsión vuelve a la identidad común sin perder jerarquía.  
**Aceptación:** un token cambia de forma controlada todas las superficies migradas y Previsión ya no parece otra app.

## PRE-013 · Legibilidad, touch y accesibilidad operativa

**Fusiona:** ART-002, MOB-001/003/004/005/007, A11Y-002/003/004/005/006/009.  
**Acción:** mínimos de 13/14 px según rol, targets 44×44, 430 px, source route, teclado virtual, contraste real, aria-invalid/describedby, focus management y zoom/reflow.  
**Aceptación:** matriz ampliada + revisión humana sin barreras P1.

## PRE-014 · Gráficos financieros interactivos y accesibles

**Fusiona:** VIZ-001/002/003/004/006/007/008, A11Y-001, MOB-006.  
**Acción:** primitives de chart; tooltip tap/focus/hover; neto divergente; overrun de presupuesto; curva de saldo previsto; tablas alternativas.  
**Aceptación:** gráfico legible por touch/teclado/lector y cada visual responde una pregunta financiera.

## PRE-015 · Inicio rápido y tolerante a fallos parciales

**Fusiona:** PERF-001/002/003, EDGE-008, UX-006.  
**Acción:** eliminar monthly redundante primero; luego carga progresiva o agregador que componga motores.  
**Aceptación:** una petición menos inmediatamente y fallo de widget secundario no derriba saldo/balance.

## PRE-016 · Corregir carrera de peticiones en Movimientos

**Fusiona:** FE-001, EDGE-004, Beta 8.  
**Acción:** request sequence/abort separado para replace/append + test A-lenta/B-rápida.  
**Aceptación:** respuesta obsoleta nunca reemplaza filtro actual.

## PRE-017 · Semántica financiera correcta en copy

**Fusiona:** PROD-004, COPY-002/003/005/010.  
**Acción inmediata:** “Disponible total”→“Saldo total en cuentas”; “Patrimonio disponible”→“Cuentas/Saldo”; “Fuente preferente”→“Saldo confirmado por el banco”.  
**Aceptación:** ningún término principal promete una métrica inexistente.

## PRE-018 · Retirar lenguaje de desarrollo de la UI

**Fusiona:** MKT-001/003/007, UX-008, COPY-001/004/007.  
**Acción:** fases/build/runtime/preflight al área Diagnóstico; primer nivel orientado a usuario.  
**Aceptación:** uso diario sin `FASE N`, ids de build o lenguaje de ingeniería no necesario.

## PRE-019 · Patrimonio / Net Worth real

**Fusiona:** PROD-005 + benchmark comercial.  
**Acción:** motor explícito de activos-pasivos con fuente/fecha; no reutilizar saldos como patrimonio.  
**Aceptación:** net worth trazable y separado de liquidez.

## PRE-020 · Confianza comercial y ciclo de datos

**Fusiona:** MKT-006 y partes de onboarding.  
**Acción:** privacidad/condiciones/retención/exportación/borrado/soporte/estado cuando exista salida real.  
**Aceptación:** usuario conoce tratamiento y opciones de sus datos; afirmaciones de seguridad respaldadas por controles.

---

# P2 — ALTO / mejora sustancial

## PRE-021 · Contratos API compartidos y componentes cliente más pequeños

**Fusiona:** FE-002, FE-003, FE-006, BE-005.  
**Acción:** DTO/guards compartidos y extracción por frontera estable, no microcomponentes.

## PRE-022 · Presupuestos: histórico ≠ recomendación + exceso visible

**Fusiona:** PROD-007, VIZ-003, Beta 6.  
**Acción:** separar baseline histórico/límite/objetivo, contexto de ingresos/ahorro y magnitud de overrun.

## PRE-023 · Flujo Recurrentes ↔ Previsión

**Fusiona:** UX-004 + PROD-003.  
**Acción:** deep-link/CTA de impacto y navegación bidireccional.

## PRE-024 · Medición real de rendimiento y budgets de regresión

**Fusiona:** PERF-007 y QA.  
**Acción:** RUM Web Vitals por ruta/dispositivo, p50/p75/p95 y thresholds.

## PRE-025 · Matriz de edge cases ampliada

**Fusiona:** EDGE-001/005/006/007/009.  
**Incluye:** cero exacto, max-length, 10k benchmark, sesión expirada con draft, base vacía.

## PRE-026 · Cache/deduplicación segura tras medir

**Fusiona:** PERF-004.  
**Acción:** in-flight dedupe/cache corta invalidada por mutación; no cachear fuente bancaria de forma peligrosa.

## PRE-027 · Escalabilidad OCR/sync condicionada a métricas

**Fusiona:** PERF-005/006/008.  
**Acción:** job queue OCR y batch SQL de ingesta sólo si benchmarks lo justifican. No tocar el motor sólo por “optimizar”.

---

# P3 / P4 — Pulido posterior

- Biblioteca tipográfica/iconográfica queda incluida en PRE-012/021 según orden.
- Tema light/system: después de tokens semánticos; no es requisito previo por sí solo.
- Naming comercial distinto de “Financial App”: decisión de marca, no parche técnico.
- Motion/microinteracciones: sólo después de navegación, legibilidad, rendimiento y accesibilidad.

---

## Contradicciones resueltas

### RLS
No activar RLS indiscriminadamente sólo para silenciar advisor. Primero PRE-001 tenancy; después RLS/ownership de forma coherente.

### Índices “unused”
No eliminar sin workload/EXPLAIN/medición. Un índice sin uso observado no demuestra que sea deuda.

### Fuente bancaria hardcoded
No reemplazar. Es una protección del caso personal; se encapsula como adaptador de compatibilidad (PRE-002).

### Reescritura de frontend
No. Se corrigen primero errores y se introducen primitives/shell por migración incremental.

### Tema claro de Previsión
No convertirlo en segundo tema oficial. Se migra a tokens comunes; un futuro light mode se diseñará después.

### OCR
No volver a tocar agresivamente el algoritmo visual durante esta auditoría sin fixtures/regresión. Escala/queue sólo bajo PRE-027.

### “Disponible” y “Patrimonio”
Corregir el copy ahora; motores de disponibilidad/net worth son iniciativas separadas.

---

## Primer bloque recomendado de implementación

Antes de abordar P0 estructurales comerciales, aplicar un bloque de **alto retorno y bajo riesgo** sobre la rama de auditoría:

1. PRE-017 copy financiero correcto.
2. PRE-018 retirar fases/lenguaje interno de superficies principales.
3. FE-004/005: 404/loading/error globales coherentes.
4. PERF-001: eliminar petición monthly redundante de Inicio.
5. PRE-016: test de race + sequence en Movimientos.
6. PRE-013: targets de Previsión + 430 px + `/configuration/source` en matriz.
7. PRE-005 parte segura: `poweredByHeader=false` + headers no-CSP inicialmente; CSP después de inventario.

Cada punto debe pasar E2E antes de avanzar.

## Estado

Comité conjunto: **COMPLETADO**.

Matriz priorizada única: creada.

Estado comercial: **NO APTA**.
