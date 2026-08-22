# Release gate — Financial App 2.1.0

Estado: CANDIDATA VALIDADA. Pendiente únicamente de promoción controlada a producción.

## Base protegida

Financial App 2.0.1 permanece congelada en producción como checkpoint recuperable hasta que termine el smoke postproducción de 2.1.0. La rama de trabajo `financial-app-rebuild` mantiene Vercel bloqueado para evitar previews y consumo innecesario.

## Objetivo de 2.1.0

Evolucionar la base estable sin añadir complejidad gratuita. Las prioridades son rendimiento percibido, legibilidad, navegación coherente, reducción de trabajo redundante, Movimientos y Plan, conservando intactas las garantías financieras, de autenticación, recuperación y origen de solo lectura.

## Bloques

### B1 · navegación y legibilidad
- [x] Desactivar el prefetch automático de toda la navegación privada.
- [x] Prefetch solo por intención del usuario: hover, foco o touch.
- [x] Elevar la navegación compacta de tablet/móvil a 13 px efectivos.
- [x] Elevar etiquetas `eyebrow` a 12 px efectivos.
- [x] Añadir `audit:v210` al CI.

### B2 · shell y carga redundante
- [x] Eliminar 16 sidebars duplicados renderizados dentro de páginas privadas cuando el shell persistente ya los proporciona.
- [x] Mantener un único estado de navegación visible y accesible.
- [x] Convertir la ausencia de sidebars internos en una garantía de `audit:v210`.
- [x] Verificar que loading, errores, foco y build siguen pasando los gates heredados.

### B3 · Movimientos
- [x] Medir primera carga, payload y coste de facetas sobre el dataset real; baseline en `docs/PERFORMANCE_V2.1.0.md`.
- [x] Evitar reenviar facetas globales en paginaciones, filtros y recargas posteriores; el cliente conserva las de la primera carga.
- [x] Mantener la RPC 2.0.1 estable como fuente de verdad y descartar una RPC dinámica duplicada de mayor riesgo para esta release.
- [x] Confirmar por CI que edición, splits, conciliación, OCR, filtros y build permanecen sin regresiones.

### B4 · Plan y coherencia
- [x] Revisar duplicidades entre Inicio, Plan, Previsión, Presupuesto y Objetivos.
- [x] Mantener una única fuente de decisión por cifra y enlaces `sourcePath` trazables.
- [x] Comprobar sobre la base real que las magnitudes compartidas coinciden con sus motores canónicos.
- [x] Mantener Inicio a 30 días y Plan a 90 días como horizontes explícitamente diferenciados.

### B5 · cierre 2.1.0
- [x] Readiness previo de Supabase sin fallos, con Google, origen de solo lectura, almacenamiento privado y sincronización correcta.
- [x] Versionado preparado en runtime, paquete y lockfile como 2.1.0.
- [x] Migración de versión de base preparada pero no aplicada antes del despliegue para evitar desalinear la 2.0.1 que sigue en producción.
- [ ] Ejecutar gate CI final sobre el commit candidato exacto: dependencias, auditorías, accesibilidad, typecheck y build.
- [ ] Promocionar el mismo commit validado a `main`.
- [ ] Esperar a que el único despliegue de producción quede READY.
- [ ] Aplicar `FINANCIAL_APP_2.1.0_VERSION.sql` y repetir release readiness con identidad Google.
- [ ] Smoke postproducción sobre `financialapp-home.vercel.app` y conservar rollback 2.0.1 hasta cerrar el release.

## Artefactos históricos

El antiguo documento V2.1.0 previo al reinicio se conserva únicamente en `docs/legacy/RELEASE_GATE_V2.1.0_PRE_REBUILD.md`. `database/V2.1.0_NORMALIZED_MIGRATIONS.md` pertenece también a aquella arquitectura histórica y **no es una migración activa ni una especificación del 2.1.0 actual**.
