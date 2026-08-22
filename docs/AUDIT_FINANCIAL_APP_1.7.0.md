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
- README raíz y README de Supabase actualizados al runtime real de Financial App 1.7.0.
- Las carpetas `finanzas-v3-*` heredadas se retiran de la rama activa, conservándose en el historial Git.
- `financial-app-initial-import` se incorpora al repositorio exactamente en su estado remoto deshabilitado (`410 Gone`), cerrando esa diferencia de reproducibilidad.

## Decisiones de caché
Los datos financieros vivos continúan `private, no-store`: saldo, movimientos, mes abierto, presupuesto y Control no se sirven obsoletos. Se cachean agresivamente solo recursos inmutables (marca/iconos) y de forma corta/revalidable el manifest. El mayor ahorro de latencia se obtiene consolidando lecturas, no ocultando resultados antiguos detrás de TTL.

## Validación final
- `package.json`, `package-lock.json`, runtime, `app_version`, `target_version`, Home, Dashboard y backup: **1.7.0**.
- Backup exportado y revalidado bajo sesión `authenticated`: `ok=true`.
- `release_readiness`: candidate `1.7.0`, target `1.7.0` y producción bloqueada exclusivamente por `google_identity_not_validated`.
- CI GitHub: instalación reproducible, árbol de dependencias, auditor estructural, auditor 1.7, accesibilidad, TypeScript, build de producción y gate de reproducibilidad: **verde**.
- Vercel no se utiliza para este bloque.

## Advisors Supabase
No aparecen WARN nuevos atribuibles a Financial App 1.7.0. Las tablas `financial_app.*` muestran `RLS enabled/no policy` a nivel INFO de forma intencionada: el acceso directo queda denegado y se realiza por RPC autorizada. El WARN de función `SECURITY DEFINER` ejecutable corresponde a `trayectos_clio_protect_valid_photo_match()` de otro proyecto dentro del Supabase compartido. El aviso global de leaked-password protection debe revisarse junto con el cierre de Email Auth cuando Google OAuth quede configurado.

Los avisos de rendimiento son índices sin uso a nivel INFO. No se eliminan automáticamente: una estadística de uso baja en una base con poca actividad no demuestra que el índice sea innecesario.

## Bloqueo externo que no se falsea
Google OAuth sigue necesitando credenciales Web reales en Google Cloud/Supabase. Mientras `external.google=false`, `release_readiness` debe continuar indicando que producción no está lista. No se activa un restore destructivo hasta tener un procedimiento de reconstrucción probado contra una base aislada; 1.7 formaliza y valida el formato portable primero.

## Backend heredado remoto
Las Edge Functions antiguas `finanzas-v3-*` ya no forman parte del árbol activo de esta rama. Algunas continúan desplegadas en el proyecto Supabase compartido y no se eliminan a ciegas porque pueden pertenecer a generaciones o aplicaciones anteriores. La limpieza remota exige demostrar antes que no existe ningún consumidor.
