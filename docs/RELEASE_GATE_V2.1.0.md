# Release gate — Financial App 2.1.0

Estado: EN DESARROLLO. No desplegada.

## Base protegida

Financial App 2.0.1 permanece congelada en producción como checkpoint recuperable. Ningún trabajo de 2.1.0 se promociona a `main` hasta superar el gate completo. La rama de trabajo `financial-app-rebuild` mantiene Vercel bloqueado para evitar previews y consumo innecesario.

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
- [ ] Auditar coste real de primera carga, filtros y paginación.
- [ ] Evitar respuestas o facetas redundantes cuando no sean necesarias.
- [ ] Mantener edición, splits, conciliación, OCR y filtros sin regresiones.

### B4 · Plan y coherencia
- [ ] Revisar duplicidades entre Inicio, Plan, Previsión, Presupuesto y Objetivos.
- [ ] Mantener una única fuente de decisión por cifra y enlaces `sourcePath` trazables.

### B5 · cierre 2.1.0
- [ ] Auditoría financiera, seguridad, rendimiento, responsive y accesibilidad.
- [ ] `npm ci`, árbol de dependencias, todos los gates heredados, typecheck y build.
- [ ] Release readiness de Supabase sin fallos.
- [ ] Versionado final coherente en runtime, paquete, lockfile y base de datos.
- [ ] Un único merge a `main` y un único despliegue de producción.
- [ ] Smoke postproducción y rollback 2.0.1 disponible hasta cerrar el release.

## Artefactos históricos

El antiguo documento V2.1.0 previo al reinicio se conserva únicamente en `docs/legacy/RELEASE_GATE_V2.1.0_PRE_REBUILD.md`. `database/V2.1.0_NORMALIZED_MIGRATIONS.md` pertenece también a aquella arquitectura histórica y **no es una migración activa ni una especificación del 2.1.0 actual**.
