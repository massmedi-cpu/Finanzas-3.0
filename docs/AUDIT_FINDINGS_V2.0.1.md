# Auditoría exhaustiva — Finanzas 3.0 V2.0.1

Fecha: 2026-08-20
Estado: correcciones en validación; no promover a producción hasta completar CI y verificación.
Baseline protegido: V2.0.0 / commit `a3b55fa2dfeb99e2be2a180f64fac6e55cbb9d63`.
Rama de trabajo: `audit/v2.0.1`.

## Alcance revisado

- Código Next.js desde la entrada hasta páginas, componentes, dominio, seguridad y sincronización.
- Flujo Google Drive → Supabase Edge Function → snapshot privada → Next.js.
- Estado real de Vercel y Supabase.
- Integridad de la fuente y tablas privadas.
- Rendimiento de navegación y carga inicial.
- Reglas financieras de ingresos, gastos, traspasos, duplicados y saldos.
- CI, versionado, PWA/manifest, autenticación y documentación.
- Cumplimiento del Prompt Maestro Axioma consolidado el 18/08/2026 y del prompt complementario de auditoría.

## Hallazgos y acciones

### P0/P1 — Peticiones de fuente innecesariamente costosas — CORREGIDO EN BACKEND V4

**Evidencia:** los logs de Supabase mostraban lecturas de `finanzas-v3-bridge/source` de aproximadamente 4,0–5,4 s. La fuente de Google Drive no había cambiado desde las 07:25 UTC, pero el snapshot se refrescaba repetidamente durante la tarde.

**Causa:** al caducar el TTL de 60 s se descargaba, descomprimía, parseaba y hasheaba de nuevo todo el XLSX aunque `modifiedTime` de Drive siguiera igual.

**Corrección:** `finanzas-v3-bridge` V4 consulta primero metadata de Drive. Si `modifiedTime` coincide con el snapshot, solo renueva la marca de sincronización y reutiliza las 3.133 filas ya validadas. La descarga/parsing completo queda reservado a un cambio real o a `refresh=1`. Se deduplican además refrescos concurrentes dentro de la misma instancia.

**Protección:** el código del Edge Function queda versionado en `supabase/functions/finanzas-v3-bridge/index.ts` antes del despliegue.

### P1 — Precarga masiva de rutas privadas — CORREGIDO EN V2.0.1

**Causa:** la navegación global mostraba diez `Link` y la portada ocho tarjetas adicionales. Next.js podía precargar rutas visibles y provocar simultáneamente llamadas a fuente, estado privado, recurrentes y splits.

**Evidencia:** los logs mostraron ráfagas simultáneas de esos endpoints y repetidas validaciones de sesión en una misma ventana temporal.

**Corrección:** `prefetch={false}` en navegación principal y tarjetas pesadas de la portada. Las páginas se solicitan cuando el usuario realmente navega.

### P1 — Ausencia de estado de carga de navegación — CORREGIDO EN V2.0.1

No existía `app/loading.tsx`; una navegación dinámica podía parecer bloqueada hasta recibir todos los datos. Se añade un estado de carga accesible y coherente con la interfaz.

### P1 — CI insuficiente para declarar una versión válida — CORREGIDO PARCIALMENTE

El CI solo ejecutaba TypeScript y build. Se añade una batería de regresión financiera ejecutada antes de typecheck/build y se activa también para ramas `audit/**`.

Pruebas añadidas:
- traspaso interno excluido del cash flow;
- transferencia bancaria externa conservada;
- cálculo mensual con ingresos/gastos/traspasos;
- detección de candidatos duplicados;
- preservación del saldo más reciente según el orden descendente real de la fuente.

Pendiente de fases posteriores: E2E/browser automatizado más amplio.

### P1 — Clasificación de transferencias demasiado amplia — CORREGIDO

Antes cualquier `movementType` que contuviera `transfer` se trataba como traspaso y se excluía de ingresos/gastos. Eso podía borrar del cash flow una transferencia bancaria externa futura. Ahora solo se excluyen los tipos explícitamente internos (`traspas...` o `transfer...` + `intern...`).

La fuente actual contiene `Traspaso interno`, por lo que la corrección mantiene la semántica vigente.

### P2 — Doble implementación obsoleta de sincronización — CORREGIDO

Se eliminan `lib/sync/google-sheets.ts` y `lib/sync/googleSheets.ts`, ambos sin uso y uno de ellos placeholder. La ruta real queda en `src/sync/*` + Edge Function versionada.

### P2 — Recurso PWA interceptado por autenticación — CORREGIDO

`manifest.ts` referencia `/icon.svg`, pero el matcher del proxy no lo excluía. Sin sesión, el icono podía recibir una redirección a login. Se excluyen `icon.svg` y `robots.txt` del proxy.

### P1 — Dependencias no reproducibles — PENDIENTE

`package.json` utiliza `latest` para framework, React, TypeScript y tipos y no existe lockfile versionado. Un build futuro puede resolver versiones distintas sin cambio de código. Debe capturarse el árbol exacto validado y versionar un lockfile antes de considerar la cadena de producción plenamente reproducible.

No se han fijado versiones a ciegas durante esta auditoría para evitar introducir una regresión de dependencias.

### P1 — Escalabilidad de Movimientos — PENDIENTE

`MovementsExplorer` recibe todas las operaciones y filtra/renderiza en memoria. Con 3.133 movimientos actuales es utilizable, pero contradice el objetivo del Axioma de soportar decenas o cientos de miles sin cargar todo innecesariamente. Requiere paginación/virtualización o consulta incremental sin perder búsqueda y edición.

### P1 — Autenticación y secretos del backend legado — PENDIENTE DE MIGRACIÓN CONTROLADA

La arquitectura actual usa validación de token personalizada entre Edge Functions y el backend legado. Se detectó además configuración sensible incrustada en código de una función legada. No se reproduce ningún secreto en esta documentación. Debe migrarse a variables/secretos gestionados y rotarse después, mediante una implantación separada y reversible.

### P2 — Cookie presente pero no validada en `proxy.ts` — PENDIENTE

El proxy permite entrar al shell si existe cookie, aunque el backend valida después el token. No expone datos por sí solo, pero una cookie inválida/expirada puede generar una experiencia de errores de datos en vez de redirigir limpiamente a login. Requiere endurecimiento coordinado con la estrategia de sesión.

### P2 — RLS sin políticas públicas — REVISADO, NO CAMBIAR

Supabase marca tablas `finance_v3_*` con RLS activado y sin policies. En la arquitectura actual el acceso de servidor usa service role y el acceso anónimo queda bloqueado. Añadir políticas amplias sería menos seguro, por lo que no se cambia durante esta auditoría.

### INVESTIGADO — Saldo más reciente por cuenta — NO ERA UN FALLO

Se investigó si varios movimientos del mismo día podían dejar un saldo antiguo. La fuente real está ordenada en sentido descendente: 947 cambios de fecha descendentes, 0 ascendentes y 2.185 filas consecutivas del mismo día. En 1.944 pares comprobables, la relación importe/saldo confirma ese orden y ninguna confirma el orden ascendente. Cambiar el algoritmo para conservar la última fila del día habría creado una regresión. No se modifica.

## Cumplimiento del Prompt Maestro

### Cumplido o protegido

- Fuente original de solo lectura: se mantiene; los ajustes operativos viven en capa privada.
- No duplicar hechos financieros: revisado en motores y merge; no se introduce nueva duplicación.
- Traspasos internos no son ingreso/gasto: reforzado y probado.
- Punto de retorno: baseline V2.0.0 registrado y rama V2.0.1 separada.
- Versionado MAJOR.MINOR.PATCH: V2.0.1.
- Prueba de regresión para error importante: incorporada al CI.
- Reducir peticiones redundantes y operaciones costosas: corregido en navegación y bridge.
- Carga progresiva/velocidad percibida: añadido estado de carga.
- Evitar implementaciones duplicadas/placeholders: limpieza aplicada.
- Documentar antes/después y hallazgos: este documento.

### Incumplimientos o deuda aún abierta

- Dependencias/lockfile reproducible.
- E2E, consola y matriz automática completa de responsive/modos.
- Escalabilidad de tabla de movimientos a 100k+.
- Consolidación de toda la documentación exigida por el Axioma dentro del repositorio.
- Migración segura de secretos/configuración legada.
- Verificación final de V2.0.1 en URL de producción antes de marcarla estable.

## Estado de datos auditado

Snapshot actual: 3.133 movimientos.
Tipos de movimiento observados:
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

No se ha ejecutado ninguna modificación destructiva sobre la fuente bancaria original.

## Criterio de cierre

V2.0.1 no se considerará `COMPLETADA` hasta que:
1. CI de pruebas + typecheck + build pase;
2. exista deployment de la rama/PR;
3. se compruebe `/api/health` con versión 2.0.1;
4. se revise la URL servida;
5. se confirme ausencia de regresiones críticas antes de promoción a `main`.
