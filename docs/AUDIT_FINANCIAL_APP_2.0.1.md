# Financial App 2.0.1 — estabilización y protección de lecturas

## Objetivo

2.0.1 es una versión de estabilización. No añade módulos financieros nuevos: corrige fallos encontrados al usar 2.0.0 con autenticación, datos y permisos reales, y convierte esas correcciones en invariantes verificables para evitar regresiones.

## Incidencias reales cerradas

### Google OAuth
- Se habilitó Google como proveedor en Supabase Auth.
- La URL de producción dejó de apuntar a `localhost:3000` y utiliza el dominio público de Financial App.
- El acceso Google -> Supabase -> Financial App fue validado con una sesión real.
- El botón de Google deja de ocultar errores inmediatos: cualquier fallo de inicio vuelve a `/login?error=oauth`, donde existe un mensaje accesible `role="alert"`.

### Inicio: `cannot execute INSERT in a read-only transaction`
La referencia de error observada en producción condujo a `forecast_overview_core()`: el overview de Previsión ejecutaba `forecast_refresh_core(v_end)` durante una lectura. Ese refresh realiza `INSERT/UPDATE` sobre ocurrencias de previsión y no debe ejecutarse desde Inicio, Plan ni un GET.

El hotfix `FINANCIAL_APP_2.0.0_READ_ONLY_FORECAST_HOTFIX.sql`:
- elimina el refresh del overview de lectura;
- conserva la generación de ocurrencias en los caminos explícitos de creación/edición de previsiones;
- marca overview y wrapper como `STABLE`.

En el momento de aplicar el hotfix no existían previsiones guardadas ni ocurrencias pendientes, por lo que no se perdió ni alteró estado de previsión existente.

## Endurecimiento 2.0.1

La auditoría posterior encontró funciones de lectura que no contenían escrituras pero seguían declaradas `VOLATILE` por herencia histórica. `FINANCIAL_APP_2.0.1_READ_PATH_HARDENING.sql` verifica primero que las funciones seleccionadas no contienen `INSERT`, `UPDATE` o `DELETE` directos y después las marca `STABLE`.

Quedan cubiertas las rutas de lectura de:
- autorización de sesión;
- Movimientos y sus vistas enriquecidas;
- detalle de movimiento;
- Reglas y preview de reglas;
- Plan Financiero.

Esto hace que PostgreSQL participe en la protección: una escritura accidental introducida dentro de estas rutas ya no puede pasar inadvertida.

## Smoke test sobre base real

Tras aplicar el hardening se ejecutaron con una identidad autorizada de prueba en la sesión SQL, sin exponer datos personales:
- Inicio;
- Plan;
- Movimientos;
- detalle de movimiento;
- Reglas.

Las cinco rutas devolvieron objetos correctamente. No se insertaron datos de prueba ni se modificaron datos financieros.

## Protección automática

`scripts/audit-v201.mjs` impide que 2.0.1 avance si:
- desaparece el hotfix de Previsión;
- el hardening deja de cubrir alguno de los RPC de lectura críticos;
- GET de Previsión vuelve a invocar mutaciones;
- Google OAuth vuelve a silenciar errores inmediatos;
- CI deja de ejecutar el gate 2.0.1;
- la rama `financial-app-rebuild` deja de estar bloqueada para previews automáticos;
- la documentación deja de reflejar el dominio público vigente.

## Despliegue

La rama `financial-app-rebuild` continúa con Vercel deshabilitado. Durante la estabilización no se crean previews. Producción permanece en 2.0.0 hasta que 2.0.1 supere auditorías, typecheck y build completos y se decida un único despliegue de release.
