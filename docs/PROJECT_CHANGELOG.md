# Changelog canónico — Finanzas 3.0

## V3.0.0 — release integral

### Arquitectura y rendimiento
- Consolidada la capa normalizada y analítica introducida desde V2.1/V2.2.
- Movimientos conserva paginación keyset y las superficies principales quedan protegidas contra la reintroducción de `loadValidatedSource()`.
- Previsión soporta horizonte real de hasta 60 meses con calendario mensual y resumen anual.

### Inteligencia y control
- Objetivos inteligentes, capacidad mensual y prioridades predictivas.
- Cierre mensual persistente/reabrible con drift y auditoría.
- Reglas privadas reversibles con preview, precedencia manual y sugerencias explicables.
- Centro de Control con auditorías persistentes de checksum, sincronización y calidad.

### Portabilidad y recuperación
- Exportación JSON de la capa privada sin duplicar la fuente bancaria.
- Checkpoints internos y restauración atómica con preview, checksum, referencias y confirmación explícita.

### Seguridad
- `finanzas-v3-data`, `finanzas-v3-recurring` y `finanzas-v3-splits` endurecidas a autorización fail-closed.
- CI prohíbe la regresión al patrón fail-open.
- RLS deny-by-default preservado para las tablas privadas.
- Añadido índice de cobertura a la FK de eventos de reglas tras el advisory de rendimiento final.

### Release
- Gate V3.0 exige integridad financiera, seguridad, recuperación, CI completo, preview exacto de Vercel y verificación de producción antes de declarar publicación completada.

## V2.1.0 — arquitectura normalizada y escalabilidad

### Datos y sincronización
- Activado el modelo normalizado PostgreSQL en paralelo al snapshot JSON existente.
- Introducido `finance_principals` para desacoplar la identidad financiera de Supabase Auth sin cambiar la sesión privada actual.
- Normalización idempotente con historial de versiones, sync runs, auditoría y detección de desaparecidos.
- El histórico sin cuenta explícita se conserva sin inventar una cuenta real.
- Edge `finanzas-v3-normalized` comprueba metadatos de Drive y solo descarga/reprocesa la fuente cuando cambia.

### Rendimiento
- Movimientos usa paginación keyset real de 100 filas, búsqueda y filtros en servidor.
- Cuentas deja de recorrer todo el histórico para obtener saldos.
- Estado de fuente y resumen financiero de Inicio usan resultados compactos normalizados.
- Página SQL de referencia en el dataset actual: ~14 ms dentro de PostgreSQL.

### Exactitud
- 3.135/3.135 movimientos normalizados con checksum y conjunto de IDs idénticos.
- Segunda sincronización sin cambios: 0 insertados, 0 actualizados, 3.135 sin cambios.
- 0 diferencias en la comparación histórica mensual.
- Resumen 2026-08 equivalente a V2.0.2, incluyendo overlay privado: 24 movimientos, 11 pendientes, 20,73 € ingresos, 728,31 € gastos y -707,58 € netos.

### Seguridad
- Browser no recibe service-role ni credenciales Google.
- RPC `finance_v210_*` restringidas a service-role.
- RLS permanece habilitado; acceso cliente directo cerrado.
- `pg_trgm` movido a `extensions`.

### Protección de regresiones
- CI impide que Movimientos, Cuentas, FinancialSummary o SourceHealth vuelvan a cargar `loadValidatedSource()`.
- V2.0.2 permanece como rollback durante el gate de publicación.

## V2.0.2 — hardening de release y acceso inicial

### Calidad y seguridad
- El CI arranca el build real de Next.js y ejecuta un smoke HTTP después de `next build`.
- El smoke protege health/versionado, redirecciones privadas, APIs privadas, manifest, icono, robots y cabeceras de seguridad.
- Un workflow independiente comprueba producción después de cada merge a `main` y espera hasta la versión exacta desplegada.

### Rendimiento
- El login deja de depender de `useSearchParams` + Suspense para mostrar el formulario.
- El formulario de acceso vuelve a ser visible en el primer HTML y `/login` permanece prerenderizado.
- Se mantiene la protección contra destinos `//...` tras autenticarse.

### Alcance
- No cambia ninguna fórmula financiera, dato de origen, overlay privado ni esquema de base de datos.

## V2.0.1 — auditoría, rendimiento y protección de regresiones

### Rendimiento
- Bridge evita descargar/descomprimir/parsear el XLSX si Drive no ha cambiado.
- Deduplicación de refrescos simultáneos de fuente y caché corta en runtime.
- Vercel `cdg1`, próximo a Supabase `eu-west-3`.
- Desactivado prefetch automático de rutas privadas pesadas y paralelizadas lecturas independientes.
- Eliminadas recargas completas redundantes tras ediciones.
- Movimientos renderiza 100 filas iniciales y amplía en bloques.

### Exactitud y seguridad
- Transferencias externas no se excluyen como traspasos internos.
- Calidad/duplicados usan vista efectiva con ajustes privados.
- Cálculos se detienen si falta una capa necesaria.
- Cookie inválida/expirada no entra al shell privado.
- RLS y RPC privilegiadas auditadas.

### Calidad técnica
- Versionado centralizado, dependencias fijadas, lockfile y CI reproducible.
- Edge Functions V3 exclusivas versionadas y esquema V3 documentado.
