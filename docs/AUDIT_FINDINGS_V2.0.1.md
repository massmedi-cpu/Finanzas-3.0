# Auditoría exhaustiva — Finanzas 3.0 V2.0.1

Fecha: 2026-08-20
Estado: correcciones implementadas; pendiente únicamente del preview final bloqueado temporalmente por el límite de builds de Vercel.
Baseline protegido: V2.0.0 / commit `a3b55fa2dfeb99e2be2a180f64fac6e55cbb9d63`.
Rama de trabajo: `audit/v2.0.1`.

## Alcance revisado

- Código Next.js desde entrada, navegación, páginas, componentes y edición cliente hasta dominio, seguridad y sincronización.
- Flujo Google Drive → Supabase Edge Function → snapshot privada → Next.js.
- Estado real de Vercel y Supabase y colocación regional de los runtimes.
- Integridad de la fuente y tablas privadas.
- Rendimiento de navegación, carga inicial y acciones de edición.
- Reglas financieras de ingresos, gastos, traspasos, duplicados y saldos.
- CI, versionado, PWA/manifest, autenticación y documentación.
- Cumplimiento del Prompt Maestro Axioma consolidado el 18/08/2026 y del prompt complementario de auditoría.

## Hallazgos y acciones

### P0 — Distancia Vercel ↔ Supabase — CORREGIDO

**Evidencia:** los previews de Next.js se ejecutaban en `iad1` (Washington D. C.) mientras Supabase está en `eu-west-3` (París). Cada lectura privada añadía un salto transatlántico innecesario.

**Corrección:** se añade `vercel.json` con región única `cdg1` (París). El preview posterior confirmó `regions: ["cdg1"]` y `/api/health` respondió como V2.0.1.

### P0 — Probe de sesión atravesaba el backend legado — CORREGIDO

**Causa:** `finanzas-v3-bridge`, `finanzas-v3-data`, `finanzas-v3-recurring` y `finanzas-v3-splits` validaban el token mediante `/api/__finanzas_v3_token_probe__` del backend legado. Esa ruta se reenviaba a Cloudflare, incorporando una llamada remota adicional a prácticamente todas las lecturas V3.

**Corrección:** `finanzas-alberto-api` V5 resuelve el probe dentro de Supabase y valida localmente el mismo token existente. Se mantiene compatibilidad con las sesiones actuales y se elimina el salto a Cloudflare para este caso.

### P0/P1 — Peticiones de fuente innecesariamente costosas — CORREGIDO EN BACKEND V4 + CLIENTE V2.0.1

**Evidencia:** los logs de Supabase mostraban lecturas de `finanzas-v3-bridge/source` de aproximadamente 4,0–5,4 s. La fuente de Google Drive no había cambiado, pero el snapshot se refrescaba repetidamente. El snapshot actual contiene 3.133 movimientos y ocupa aproximadamente 2,2 MB en JSON.

**Corrección backend:** `finanzas-v3-bridge` V4 consulta primero metadata de Drive. Si `modifiedTime` coincide con el snapshot, reutiliza las filas validadas. La descarga/parsing completo queda reservado a un cambio real o `refresh=1`. Se deduplican además refrescos concurrentes dentro de la misma instancia.

**Corrección Next.js:** `src/sync/google-sheets.ts` añade caché corta en proceso (60 s) por sesión y deduplicación de peticiones concurrentes. Navegaciones consecutivas dentro del mismo runtime dejan de transportar otra vez el snapshot completo.

### P1 — Conversión de 3.133 × 22 campos dos veces — CORREGIDO

El bridge ya entrega `BankingSourceRow[]` después de validar el contrato de 22 columnas. Next.js convertía esos objetos a matrices de 22 posiciones para que `loadValidatedSource()` las parseara inmediatamente de vuelta a objetos.

Se elimina esta ida y vuelta. `readGoogleSheet()` devuelve directamente filas estructuradas y `loadValidatedSource()` conserva las comprobaciones y cálculos posteriores sin volver a parsear la misma información.

### P1 — Precarga masiva de rutas privadas — CORREGIDO

La navegación global y las tarjetas de Inicio podían precargar rutas dinámicas pesadas. Se aplica `prefetch={false}` a navegación y enlaces internos relevantes para que solo se calcule la pantalla solicitada por el usuario.

### P1 — Consultas secuenciales — CORREGIDO

Las páginas que requieren varios conjuntos independientes (`source`, estado privado, splits y preferencias recurrentes) los solicitaban de forma secuencial en distintos puntos de la aplicación. Se paralelizan con `Promise.all` manteniendo los mismos fallbacks y la misma lógica financiera.

### P1 — Recarga completa después de editar — CORREGIDO DONDE EL ESTADO LOCAL ES SUFICIENTE

Se detectó un patrón repetido: tras guardar correctamente, los componentes actualizaban su propio estado con la respuesta del servidor y a continuación ejecutaban `router.refresh()`, obligando a reconstruir la página y repetir lecturas.

Se elimina la recarga redundante en:
- Movimientos: edición, restauración y divisiones.
- Presupuestos.
- Recurrentes.
- Objetivos.
- Centro de revisión.

Planificación conserva la recarga cuando el cambio afecta cálculos globales de previsión que viven fuera del gestor cliente; no se elimina a ciegas para evitar una inconsistencia visual.

### P1 — DOM masivo en Movimientos — CORREGIDO PARA EL VOLUMEN ACTUAL

Antes `MovementsExplorer` podía renderizar las 3.133 filas `<tr>` simultáneamente. Aunque el filtrado sea razonable, serialización, hidratación y DOM eran innecesariamente grandes.

Ahora:
- búsqueda y filtros siguen trabajando sobre todo el histórico;
- se renderizan inicialmente 100 movimientos;
- se amplía en bloques de 100 mediante “Mostrar 100 más”;
- cambiar búsqueda/cuenta/estado vuelve a 100 visibles;
- ninguna operación financiera se elimina ni queda fuera de búsqueda.

**Deuda a 100k+:** para decenas/cientos de miles debe activarse consulta paginada/virtualizada contra la capa normalizada de Supabase; limitar el DOM es el paso seguro inmediato, no la arquitectura final de gran escala.

### P1 — Ausencia de estado de carga — CORREGIDO

Se añade `app/loading.tsx` accesible y coherente con la interfaz para que las navegaciones dinámicas no parezcan bloqueadas.

### P1 — CI insuficiente — CORREGIDO PARCIALMENTE

El CI solo ejecutaba TypeScript y build. Ahora ejecuta también regresión financiera y se activa para ramas `audit/**`.

Pruebas cubiertas:
- traspaso interno excluido del cash flow;
- transferencia bancaria externa conservada;
- cálculo mensual con ingresos/gastos/traspasos;
- detección de candidatos duplicados;
- preservación del saldo más reciente según el orden descendente real de la fuente.

El commit de la paginación de Movimientos (`36fec5f...`) pasó CI completo. Pendiente de fases posteriores: E2E/browser automatizado más amplio.

### P1 — Clasificación de transferencias demasiado amplia — CORREGIDO

Antes cualquier `movementType` que contuviera `transfer` se trataba como traspaso y se excluía de ingresos/gastos. Ahora solo se excluyen tipos explícitamente internos (`traspas...` o `transfer...` + `intern...`). La fuente actual contiene `Traspaso interno`, por lo que no se altera la semántica vigente.

### P2 — Doble implementación obsoleta de sincronización — CORREGIDO

Se eliminan implementaciones antiguas/placeholder sin uso. La ruta real queda en `src/sync/*` + Edge Function versionada.

### P2 — Recurso PWA interceptado por autenticación — CORREGIDO

El proxy excluye `icon.svg` y `robots.txt`; se verificó además que `public/icon.svg` existe.

### P2 — Versionado visible inconsistente — CORREGIDO

Se crea `src/version.ts` como fuente única para V2.0.1 y se sustituyen etiquetas antiguas en las páginas revisadas, incluido Inicio y `/api/health`.

## Deuda no bloqueante para V2.0.1

### Dependencias no reproducibles

`package.json` usa `latest` y no existe lockfile versionado. Debe fijarse el árbol validado en una mejora controlada; no se cambian versiones a ciegas durante esta auditoría.

### Arquitectura normalizada de gran escala

Supabase ya contiene tablas profesionales (`finance_source_transactions`, `finance_accounts`, `finance_transaction_enrichments`, etc.), pero están vacías y V3 funciona aún sobre `finance_v3_current` como snapshot JSON. Activar esa capa permitiría consultas pequeñas, agregados y paginación real para 100k+ movimientos. Es una migración de arquitectura, no un parche de rendimiento, y debe abordarse con importación/verificación paralela y rollback.

### Secretos/configuración legada

Se detectó configuración sensible incrustada en código de una función legada. No se reproduce ningún secreto en esta documentación. Debe migrarse a secretos gestionados y rotarse en un cambio separado y reversible.

### Cookie presente pero no validada en `proxy.ts`

El proxy comprueba existencia de cookie y la capa de datos valida el token después. No expone datos, pero una cookie expirada puede mostrar errores de datos antes de volver a login. Queda para endurecimiento coordinado de sesión.

### RLS sin políticas públicas — REVISADO, NO CAMBIAR

Las tablas `finance_v3_*` tienen RLS activo y no tienen políticas públicas. El servidor accede mediante service role y el acceso anónimo queda bloqueado. No se añaden políticas amplias.

### Saldo más reciente por cuenta — INVESTIGADO, NO ERA UN FALLO

La fuente real está ordenada en sentido descendente. La relación entre importes y saldos confirmó que conservar la primera fila del mismo día es correcto. Cambiarlo habría creado una regresión.

## Cumplimiento del Prompt Maestro

Protegido:
- fuente original siempre de solo lectura;
- ajustes operativos solo en capa privada;
- traspasos internos fuera de ingresos/gastos;
- baseline V2.0.0 y rama de auditoría como punto de retorno;
- versionado MAJOR.MINOR.PATCH;
- pruebas financieras antes de build;
- eliminación de peticiones y trabajo redundantes;
- carga progresiva de Movimientos;
- no se ha aplicado ninguna modificación destructiva a los datos originales.

Deuda abierta:
- lockfile/dependencias reproducibles;
- E2E/browser y matriz responsive automática completa;
- migración a tablas normalizadas para 100k+;
- consolidación de documentación exigida por el Axioma;
- migración/rotación de secretos legados.

## Estado de datos auditado

Snapshot actual: 3.133 movimientos.
Tipos observados:
- Gasto: 2.409
- Traspaso interno: 390
- Ingreso: 334

Capa privada durante la auditoría:
- `finance_v3_current`: 1 fila
- snapshots: 1
- movement overrides: 2
- recurring preferences: 3
- splits: 0
- budgets/goals/future events/scenarios: 0 en el momento de la revisión

## Validación de V2.0.1

Completado:
1. regresión financiera + typecheck + build en CI;
2. preview V2.0.1 válido tras las correcciones de región/fuente;
3. ejecución del preview confirmada en `cdg1`;
4. `/api/health` respondió `ok: true`, versión `2.0.1`;
5. Edge auth probe V5 desplegado y activo;
6. icono/manifest verificados.

Pendiente antes de promover a `main`:
1. preview del `head` final con todas las optimizaciones de UI;
2. ese preview está bloqueado por `Vercel build-rate-limit`, no por un error de compilación (el mismo head se valida en CI);
3. prueba autenticada de navegación sobre el preview final y revisión de errores runtime.

V2.0.1 no se marcará estable en producción hasta superar esos últimos controles.
