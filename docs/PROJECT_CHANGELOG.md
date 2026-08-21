# Changelog canónico — Finanzas 3.0

## V2.0.2 — hardening de release y acceso inicial

### Calidad y seguridad
- El CI arranca el build real de Next.js y ejecuta un smoke HTTP después de `next build`.
- El smoke protege health/versionado, redirecciones privadas, APIs privadas, manifest, icono, robots y cabeceras de seguridad.
- Un workflow independiente comprueba producción después de cada merge a `main` y espera a la versión exacta desplegada.

### Rendimiento
- El login deja de depender de `useSearchParams` + Suspense para mostrar el formulario.
- El formulario de acceso vuelve a ser visible en el primer HTML y `/login` permanece prerenderizado.
- Se mantiene la protección contra destinos `//...` tras autenticarse.

### Alcance
- No cambia ninguna fórmula financiera, dato de origen, overlay privado ni esquema de base de datos.
- V2.0.2 es un parche de hardening sobre la V2.0.1 estable.

## V2.0.1 — auditoría, rendimiento y protección de regresiones

### Rendimiento
- Bridge V4 evita descargar/descomprimir/parsear el XLSX si Drive no ha cambiado.
- Deduplicación de refrescos simultáneos de fuente.
- Caché corta de fuente en el runtime Next.js.
- Vercel fijado a `cdg1`, próximo a Supabase `eu-west-3`.
- Desactivado prefetch automático de rutas privadas pesadas.
- Lecturas independientes paralelizadas.
- Eliminadas recargas completas redundantes tras ediciones que ya actualizan estado local.
- Movimientos renderiza 100 filas iniciales y amplía en bloques.
- Estado global de carga durante navegación dinámica.

### Exactitud financiera
- Transferencias externas ya no se excluyen como si fueran traspasos internos.
- Calidad y duplicados se calculan sobre la vista efectiva con ajustes privados.
- Informes, Plan, Previsión, Recurrentes y otros cálculos se detienen si falta una capa que pueda alterar la cifra.
- Protección del criterio de saldo más reciente según orden real de la fuente.

### Seguridad
- Cookie inválida/expirada no permite entrar al shell privado.
- Login evita redirecciones `//...` y elimina un refresh duplicado.
- Proxy excluye correctamente recursos PWA públicos necesarios.
- Revisión Supabase: RLS activo en todas las tablas V3, sin políticas públicas y RPC privilegiadas inaccesibles para `anon`/`authenticated`.

### Calidad técnica
- Versionado visible centralizado en `src/version.ts`.
- Dependencias directas fijadas; Node 22.x declarado.
- `package-lock.json` capturado del CI validado y versionado.
- Runner de regresión TypeScript basado en `tsx`.
- CI ejecuta instalación reproducible, tests, typecheck y build.
- Edge Functions V3 exclusivas versionadas.
- Esquema actual V3 documentado en `database/schema-v2.0.1.sql`.
- Eliminados residuos históricos ejecutables/ZIP del árbol activo.
