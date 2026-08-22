# Auditoría y hardening — Financial App 1.7.0

## Cerrado en este bloque
- Inicio pasa de seis llamadas financieras a una RPC unificada (`financial_app_home_overview`).
- Dashboard devuelve la versión canónica de aplicación, no `schema_version`.
- Proxy conserva allowlist; Server Components verifican claims sin repetir la consulta de allowlist. Los RPC siguen validando `authorized_email()` como segunda defensa.
- `GET /api/movements` queda libre de escrituras. El cambio `new -> normal` se reconoce por POST únicamente tras montar la vista.
- Shell de navegación persistente y navegación móvil reducida a cuatro destinos principales + «Más».
- CSS pesado se mueve de layout raíz a layouts de ruta.
- Manifest PWA real y caché larga para marca/iconos; manifest con revalidación.
- Inicio usa el resumen accionable del Centro de Control, evitando llamar «alertas» a cientos de elementos afectados.
- Cuentas elimina textos/entidades/identificadores codificados a mano y añade drill-down por cuenta.
- Backup portable de la capa privada + validación de formato y fuente antes de cualquier futura restauración. No contiene el dataset bancario original.
- `release_readiness` usa versión dinámica y deja de fijar RC1/1.0.0.
- Gate CI específico 1.7 para impedir regresiones arquitectónicas.

## Decisiones de caché
Los datos financieros vivos continúan `private, no-store`: saldo, movimientos, mes abierto, presupuesto y Control no se sirven obsoletos. Se cachean agresivamente solo recursos inmutables (marca/iconos) y de forma corta/revalidable el manifest. El mayor ahorro de latencia se obtiene consolidando lecturas, no ocultando resultados antiguos detrás de TTL.

## Bloqueos externos que no se falsean
Google OAuth sigue necesitando credenciales Web reales en Google Cloud/Supabase. Mientras `external.google=false`, `release_readiness` debe continuar indicando que producción no está lista. No se activa un restore destructivo hasta tener un procedimiento de reconstrucción probado contra una base aislada; 1.7 formaliza y valida el formato portable primero.

## Backend heredado
Las Edge Functions antiguas `finanzas-v3-*` no forman parte del runtime de Financial App 1.7. No se eliminan a ciegas del proyecto Supabase compartido porque pueden pertenecer a generaciones/proyectos anteriores. Deben retirarse únicamente tras demostrar ausencia de consumidores. `financial-app-initial-import` debe versionarse o retirarse antes de considerar el backend completamente reproducible.
