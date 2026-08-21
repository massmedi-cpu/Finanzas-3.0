# Auditoría exhaustiva — Finanzas 3.0 V2.0.1

Fecha de cierre técnico: 2026-08-21
Baseline protegida: V2.0.0 / `a3b55fa2dfeb99e2be2a180f64fac6e55cbb9d63`.
Rama: `audit/v2.0.1`.
Estado: auditoría técnica superada; pendiente únicamente de merge y verificación posterior en producción.

## Alcance

Se revisaron código Next.js, navegación, páginas, edición cliente, dominio financiero, sesión, sincronización, Edge Functions, Supabase, CI, PWA, versionado, dependencias, documentación, rendimiento y cumplimiento del Prompt Maestro/Axioma y del prompt permanente de auditoría/regresión.

## Hallazgos críticos corregidos

### Rendimiento
- Vercel estaba ejecutándose en `iad1` mientras Supabase está en París. V2.0.1 fija `cdg1`.
- El probe de sesión podía atravesar el backend legado/Cloudflare. Ahora se resuelve en Supabase y las validaciones observadas quedan en torno a decenas de milisegundos.
- La fuente bancaria de 3.133 movimientos (~2,2 MB JSON) se descargaba/procesaba más veces de las necesarias. Bridge V4 valida `modifiedTime`, reutiliza snapshots y deduplica refrescos concurrentes.
- Next.js reutiliza la fuente validada durante navegaciones consecutivas.
- Eliminada la conversión redundante objeto → matriz de 22 columnas → objeto.
- Eliminadas precargas automáticas de rutas privadas pesadas.
- Lecturas independientes paralelizadas con `Promise.all`.
- Eliminados `router.refresh()` redundantes tras ediciones que ya actualizan estado local.
- Movimientos renderiza inicialmente 100 filas, ampliables de 100 en 100, manteniendo filtros/búsqueda sobre todo el histórico.
- Se añadió estado global de carga.

### Exactitud financiera
- Una transferencia bancaria externa ya no se clasifica automáticamente como traspaso interno.
- Calidad, duplicados y alertas usan la vista efectiva con correcciones/exclusiones privadas.
- Si falta una capa privada capaz de cambiar una cifra, Informes, Plan, Previsión, Recurrentes y otros cálculos se bloquean en vez de presentar resultados parciales como válidos.
- Se investigó el orden de saldos y se confirmó que la fuente está en orden descendente; conservar la primera fila del día más reciente es correcto.

### Seguridad y sesión
- Login bloquea redirecciones `//...`.
- Eliminada una segunda recarga tras login.
- Cookies malformadas o expiradas no permiten entrar al shell privado.
- Recursos PWA necesarios quedan fuera del proxy de autenticación.
- Todas las tablas `finance_v3_*` tienen RLS activo y sin políticas públicas.
- Las RPC privilegiadas `finance_v3_*` no son ejecutables por `anon` ni `authenticated`; solo por `service_role`.
- No se añadieron políticas amplias que debilitasen la protección actual.

### Reproducibilidad y regresiones
- Dependencias directas fijadas a las versiones validadas.
- Node 22.x declarado.
- `package-lock.json` versionado.
- CI usa `npm ci`.
- CI ejecuta invariantes del proyecto, regresiones financieras, TypeScript y build de producción.
- Edge Functions exclusivas de Finanzas V3 quedan versionadas sin secretos.
- Esquema actual `finance_v3_*` documentado en `database/schema-v2.0.1.sql`.
- Versionado visible centralizado en `src/version.ts`.
- Eliminados código muerto, ZIP antiguo y residuo ejecutable V1.1 del árbol activo.

## Documentación canónica incorporada

- `docs/PROJECT_AXIOMS.md`
- `docs/ARCHITECTURE.md`
- `docs/REQUIREMENTS_TRACEABILITY.md`
- `docs/PROJECT_CHANGELOG.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/TEST_MATRIX.md`
- `docs/RELEASE_GATE_V2.0.1.md`
- `docs/BENCHMARK_V2.0.0_V2.0.1.md`
- `database/schema-v2.0.1.sql`
- `supabase/README.md`

## Validación final

HEAD de código validado: `fa078b800ffbf9cb612d934291f29b767b3f99cf`.

- GitHub Actions run #297: SUCCESS.
- Instalación reproducible con `npm ci`: SUCCESS.
- Invariantes del proyecto: SUCCESS.
- Regresiones financieras: SUCCESS.
- TypeScript: SUCCESS.
- Build de producción: SUCCESS.
- Preview Vercel `dpl_GNPrxvQD9Zmvo4NxwNhvzqt5XMUW`: READY.
- Región Vercel: `cdg1`.
- Errores runtime durante validación final: ninguno.

## Rendimiento final

La prueba intermedia que bloqueó inicialmente V2.0.1 registró `state` en 11,228 s, `splits` en 6,943 s, `/source` en 6,117 s y la validación de sesión en 5,341 s.

Después de las correcciones:
- `state` se observó en 322–383 ms en las últimas lecturas reales;
- el probe de sesión se observó en ~90 ms;
- la reducción frente al peor probe intermedio es ~98,3 %;
- la reducción de `state` frente al pico intermedio es ~96,6–97,1 %;
- después de más de 60 segundos de inactividad, la navegación repetida a Movimientos/Inicio no generó nuevas lecturas de `source`, `state`, `splits` o recurrentes: se reutilizó la navegación/datos ya disponibles en cliente.

El benchmark completo está en `docs/BENCHMARK_V2.0.0_V2.0.1.md`.

## Deuda no bloqueante posterior a V2.0.1

- Migrar progresivamente a las tablas normalizadas de Supabase para paginación/consultas reales a escala 100k+.
- Ampliar cobertura E2E/browser y matriz responsive automática.
- Migrar y rotar de forma controlada la configuración sensible del backend legado compartido; no se copió ningún secreto al repositorio.
- Revisar índices marcados como no usados cuando exista suficiente historial de consultas; no se eliminan durante esta auditoría por falta de evidencia de que sean innecesarios.

## Veredicto

V2.0.1 supera la auditoría técnica de rendimiento, exactitud, seguridad, reproducibilidad y protección de regresiones. La fuente bancaria original permanece de solo lectura y ninguna corrección destructiva se ha aplicado a los datos.

Quedan como gates operativos posteriores a este cierre documental: merge a `main`, deployment de producción READY y verificación final de producción como V2.0.1.
