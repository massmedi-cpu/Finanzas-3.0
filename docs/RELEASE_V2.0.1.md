# Financial App 2.0.1 — Release

## Alcance

Release de estabilización posterior a 2.0.0. No incorpora dominios financieros nuevos. Su objetivo es convertir los fallos observados con producción real en garantías verificables y reducir el riesgo de regresión.

## Correcciones incluidas

- Google OAuth activado y validado con una sesión real.
- URL de retorno de Supabase corregida para el dominio `financialapp-home.vercel.app`.
- Los errores inmediatos de OAuth ya no quedan ocultos: se muestran en la pantalla de acceso.
- Previsión deja de generar o consolidar ocurrencias desde rutas GET/overview.
- Inicio deja de fallar con `cannot execute INSERT in a read-only transaction`.
- Lecturas críticas de Inicio, Plan, Movimientos, detalle y Reglas reforzadas como `STABLE` tras comprobar ausencia de escrituras.

## Validación

Antes del sellado de versión se verificó:

- `financial_app_release_readiness()` con identidad Google real: `readyForProduction: true`, sin fallos.
- Fuente bancaria en modo `read_only`.
- Cero IDs de origen duplicados.
- Dos cuentas activas y cuenta de ahorro excluida de Cash Flow.
- Última sincronización correcta.
- Archivo documental privado.
- Smoke de Inicio, Plan, Movimientos, detalle y Reglas sobre la base real sin insertar datos de prueba.
- CI completo: Axioma estructural, regresiones 1.7, recuperación 1.8, documental 1.9, Plan 2.0, gate 2.0.1, backup, accesibilidad, TypeScript, build y reproducibilidad.

## Política de despliegue

La rama `financial-app-rebuild` no genera previews de Vercel. La publicación de 2.0.1 debe realizarse mediante una única promoción a `main` después de que el commit de sellado vuelva a superar CI.

## Versionado

La versión `2.0.1` queda alineada en `package.json`, `package-lock.json`, `lib/app-version.ts` y `financial_app.app_meta`. El cambio de versión no altera el árbol de dependencias.
